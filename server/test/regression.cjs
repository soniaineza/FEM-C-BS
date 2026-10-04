const assert = require('node:assert/strict');
const { validCoordinates, locationSample, queryPoint } = require('../src/utils/location');
const { rideToJson } = require('../src/utils/serialize');
const { config } = require('../src/config');
const { Pool } = require('pg');
const networkFetch = global.fetch;
let passed = 0;
async function check(name, fn) { await fn(); console.log('ok', ++passed, name); }
async function main() {
  await check('coordinate and sample validation', async () => {
    assert(validCoordinates({latitude:0,longitude:0}));
    assert(!validCoordinates({latitude:91,longitude:30}));
    assert.throws(()=>queryPoint({lat:'',lng:'30'},'lat','lng'));
    const oldEnv=config.env;config.env='production';
    for(const sample of [{latitude:0,longitude:0}, {latitude:0,longitude:0,accuracy:3000,measuredAt:Date.now()},
      {latitude:0,longitude:0,accuracy:10,measuredAt:Date.now()-60000}]) assert.throws(()=>locationSample(sample));
    assert(locationSample({latitude:0,longitude:0,accuracy:10,measuredAt:Date.now()}));config.env=oldEnv;
  });
  await check('rider coordinates hidden after pickup', async () => {
    for(const status of ['inProgress','paymentPending','completed']) {
      const json=rideToJson({status,passenger_name:'Rider',passenger_latitude:1,passenger_longitude:2});
      assert.equal(json.rider.latitude,null);assert.equal(json.rider.longitude,null);
    }
  });
  if (!process.env.TEST_DATABASE_URL) {
    console.log('SKIP database regressions: set TEST_DATABASE_URL to an isolated PostgreSQL administrator database.');
    return;
  }
  const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});
  const name=`fem_review_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  const url=new URL(process.env.TEST_DATABASE_URL);url.pathname='/'+name;
  const db=require('../src/db');
  try {
    await db.applySchema(url.toString());db.initPool(url.toString());const pool=db.getPool();
    // Never use external routing or notification providers in the fixture.
    global.fetch=async()=>({ok:false,status:503,json:async()=>({}),text:async()=>''});
    config.jwtSecret='local-regression-secret-which-is-not-a-production-secret';
    const bcrypt=require('bcryptjs');
    async function passenger(suffix) {
      const r=await pool.query(`INSERT INTO passengers(full_name,phone,email,password_hash,verified_at)
        VALUES ('Fixture',$1,$2,$3,now()) RETURNING *`, ['+2507'+suffix,'fixture'+suffix+'@example.com',await bcrypt.hash('secret123',4)]);
      return r.rows[0];
    }
    const rides=require('../src/services/rideService');
    const body={pickup:{latitude:-2.59,longitude:29.74,address:'A'},destination:{latitude:-2.60,longitude:29.75,address:'B'},vehicleId:'fem_economy',paymentMethodId:'cash'};
    const p=await passenger('100000001');
    await check('concurrent bookings create one live ride', async () => {
      const results=await Promise.allSettled([rides.createRide(p.id,body),rides.createRide(p.id,body)]);
      assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
      assert.equal(results.find(x=>x.status==='rejected').reason.status,409);
      assert.equal((await pool.query('SELECT count(*)::int n FROM rides WHERE passenger_id=$1',[p.id])).rows[0].n,1);
    });
    const p2=await passenger('100000002');
    await check('booking key replays return the same ride', async () => {
      const results=await Promise.all([rides.createRide(p2.id,{...body,bookingKey:'same-key'}),rides.createRide(p2.id,{...body,bookingKey:'same-key'})]);
      assert.equal(results[0].id,results[1].id);
    });
    const driver=(await pool.query(`INSERT INTO drivers(full_name,phone,verified,status,current_vehicle_id)
      VALUES ('Driver','+2507100000003',true,'active','fem_economy') RETURNING *`)).rows[0];
    for (const docType of ['license','national_id','vehicle_registration','insurance']) {
      await pool.query("INSERT INTO driver_documents(driver_id,doc_type,file_url,status,reviewed_by,verification_method,evidence_reference) VALUES ($1,$2,'https://example.invalid/fixture','approved','Fixture','in_person','fixture')",[driver.id,docType]);
    }
    const ops=require('../src/services/rideDriverOps');
    await ops.updateDriverLocation(driver.id,{latitude:-2.59,longitude:29.74,accuracy:10,measuredAt:Date.now()});
    const rideRows=(await pool.query('SELECT * FROM rides ORDER BY created_at')).rows;
    const matcher=require('../src/services/driverMatcher');
    await check('one driver cannot claim two private rides', async () => {
      const results=await Promise.all(rideRows.map(r=>matcher.assignDriver(r.id,driver)));
      assert.equal(results.filter(Boolean).length,1);
      assert.equal(results.find(Boolean).status,'driverAssigned');
      assert.equal((await pool.query('SELECT count(*)::int n FROM rides WHERE driver_id=$1',[driver.id])).rows[0].n,1);
    });
    await check('older driver sample cannot replace a newer measurement', async () => {
      const timestamp=Date.now();
      await ops.updateDriverLocation(driver.id,{latitude:-2.59,longitude:29.74,accuracy:10,measuredAt:timestamp});
      await ops.updateDriverLocation(driver.id,{latitude:-2.58,longitude:29.75,accuracy:10,measuredAt:timestamp-1000});
      const row=(await pool.query('SELECT * FROM driver_locations WHERE driver_id=$1',[driver.id])).rows[0];
      assert.equal(row.latitude,-2.59);assert.equal(new Date(row.measured_at).getTime(),timestamp);
    });
    const assigned=(await pool.query('SELECT * FROM rides WHERE driver_id=$1',[driver.id])).rows[0];
    await check('wallet debit rolls back if receipt creation fails; replay debits once', async () => {
      await pool.query("UPDATE rides SET status='paymentPending',payment_method='wallet',final_fare=1000 WHERE id=$1",[assigned.id]);
      await pool.query('INSERT INTO wallets(passenger_id,balance) VALUES ($1,5000)',[assigned.passenger_id]);
      const paymentOps=require('../src/services/payments');
      const ride=(await pool.query('SELECT * FROM rides WHERE id=$1',[assigned.id])).rows[0];
      const payment=await paymentOps.createPaymentForRide(ride);
      await pool.query(`CREATE FUNCTION fixture_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$;
        CREATE TRIGGER fixture_failure BEFORE INSERT ON receipts FOR EACH ROW EXECUTE FUNCTION fixture_receipt_failure()`);
      await assert.rejects(paymentOps.chargePayment(payment,ride));
      assert.equal(Number((await pool.query('SELECT balance FROM wallets WHERE passenger_id=$1',[ride.passenger_id])).rows[0].balance),5000);
      assert.equal((await pool.query('SELECT status FROM payments WHERE id=$1',[payment.id])).rows[0].status,'pending');
      await pool.query('DROP TRIGGER fixture_failure ON receipts');
      await Promise.all([paymentOps.chargePayment(payment,ride),paymentOps.chargePayment(payment,ride)]);
      assert.equal(Number((await pool.query('SELECT balance FROM wallets WHERE passenger_id=$1',[ride.passenger_id])).rows[0].balance),4000);
      assert.equal((await pool.query('SELECT count(*)::int n FROM receipts WHERE ride_id=$1',[ride.id])).rows[0].n,1);
    });
    await check('trip completion recovers arrived state and replays safely', async () => {
      const pending=(await pool.query("SELECT * FROM rides WHERE status='searchingDriver' LIMIT 1")).rows[0];
      await pool.query("UPDATE rides SET driver_id=$2,status='arrived',final_fare=1000 WHERE id=$1",[pending.id,driver.id]);
      const [a,b]=await Promise.all([ops.completeTrip(driver.id,pending.id),ops.completeTrip(driver.id,pending.id)]);
      assert.equal(a.payment.id,b.payment.id);assert.equal(a.ride.status,'paymentPending');
    });
    await check('cash settlement and completed-trip confirmation replay safely', async () => {
      const ride=(await pool.query("SELECT * FROM rides WHERE status='paymentPending' AND payment_method='cash' LIMIT 1")).rows[0];
      const paymentOps=require('../src/services/payments');const payment=await paymentOps.createPaymentForRide(ride);
      await Promise.all([paymentOps.confirmCashPayment(payment),paymentOps.confirmCashPayment(payment)]);
      assert.equal((await paymentOps.confirmCashPayment(payment)).status,'succeeded');
      assert.equal((await pool.query('SELECT count(*)::int n FROM receipts WHERE ride_id=$1',[ride.id])).rows[0].n,1);
    });
    await check('one OTP can authorize only one concurrent mutation', async () => {
      const otp=require('../src/utils/otp');const code=await otp.issueCode(pool,{passengerId:p.id,purpose:'reset'});
      let mutations=0;
      const results=await Promise.all([1,2].map(()=>otp.verifyCode(pool,{passengerId:p.id,purpose:'reset',code,apply:async()=>{mutations++;}})));
      assert.equal(results.filter(r=>r.ok).length,1);assert.equal(mutations,1);
    });
    await check('OTP and protected mutation roll back together', async () => {
      const otp=require('../src/utils/otp');const code=await otp.issueCode(pool,{passengerId:p2.id,purpose:'reset'});
      await assert.rejects(otp.verifyCode(pool,{passengerId:p2.id,purpose:'reset',code,apply:async()=>{throw new Error('fixture');}}));
      assert.equal((await otp.verifyCode(pool,{passengerId:p2.id,purpose:'reset',code})).ok,true);
    });
    await check('provider settlement rejects wrong reference, amount and cash-out', async () => {
      const provider=require('../src/services/paypackClient');
      const expected={external_reference:'fixture',amount:1000};
      for (const charge of [{ref:'other',kind:'CASHIN',amount:1000},{ref:'fixture',kind:'CASHOUT',amount:1000},{ref:'fixture',kind:'CASHIN',amount:999}]) assert.throws(()=>provider.assertChargeMatches(charge,expected));
      provider.assertChargeMatches({ref:'fixture',kind:'CASHIN',amount:1000},expected);
    });
    await check('only an outright provider refusal is a definite failure', async () => {
      const provider=require('../src/services/paypackClient');
      for (const status of [400,422]) assert.equal(provider.isRejectedRequest(Object.assign(new Error('refused'),{status})),true);
      for (const error of [new Error('timeout'),Object.assign(new Error('down'),{status:500}),Object.assign(new Error('auth'),{status:401}),null]) assert.equal(provider.isRejectedRequest(error),false);
    });
    await check('a refused mobile-money charge fails at once and frees the rider to pay cash', async () => {
      const provider=require('../src/services/paypackClient'),paymentOps=require('../src/services/payments');
      const p5=await passenger('100000011');
      const ride=(await pool.query(`INSERT INTO rides(passenger_id,vehicle_id,ride_type,pickup_address,pickup_latitude,pickup_longitude,dest_address,dest_latitude,dest_longitude,distance_km,duration_minutes,payment_method,estimated_fare,final_fare,status)
        VALUES ($1,'fem_economy','private','A',-2.59,29.74,'B',-2.60,29.75,1,5,'mtn_momo',2000,2000,'paymentPending') RETURNING *`,[p5.id])).rows[0];
      const original={isConfigured:provider.isConfigured,createCharge:provider.createCharge},demo=config.demoPayments;
      provider.isConfigured=()=>true;config.demoPayments=false;
      try {
        provider.createCharge=async()=>{throw Object.assign(new Error('bad number'),{status:400});};
        const refused=await paymentOps.chargePayment(await paymentOps.createPaymentForRide(ride),ride);
        assert.equal(refused.status,'failed');assert.equal(refused.metadata.reason,paymentOps.REJECTED_REASON);assert.equal(refused.external_reference,null);
        const p6=await passenger('100000012');
        const ride2=(await pool.query(`INSERT INTO rides(passenger_id,vehicle_id,ride_type,pickup_address,pickup_latitude,pickup_longitude,dest_address,dest_latitude,dest_longitude,distance_km,duration_minutes,payment_method,estimated_fare,final_fare,status)
          VALUES ($1,'fem_economy','private','A',-2.59,29.74,'B',-2.60,29.75,1,5,'mtn_momo',2000,2000,'paymentPending') RETURNING *`,[p6.id])).rows[0];
        provider.createCharge=async()=>{throw Object.assign(new Error('provider down'),{status:503});};
        const uncertain=await paymentOps.chargePayment(await paymentOps.createPaymentForRide(ride2),ride2);
        assert.equal(uncertain.status,'pending');assert.equal(uncertain.metadata.reason,'provider_outcome_uncertain');
      } finally {provider.isConfigured=original.isConfigured;provider.createCharge=original.createCharge;config.demoPayments=demo;}
    });
    await check('OTP resend cooldown is serialized across concurrent requests', async () => {
      const p3=await passenger('100000004');const otp=require('../src/utils/otp');
      const results=await Promise.allSettled([1,2].map(()=>otp.issueCode(pool,{passengerId:p3.id,purpose:'reset',cooldown:true})));
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(results.find(r=>r.status==='rejected').reason.status,429);
    });
    await check('promotion use rolls back on failed booking and cannot exceed cap', async () => {
      const p3=await passenger('100000005'),p4=await passenger('100000006');
      await pool.query("INSERT INTO promotions(code,title,discount_type,discount_value,max_uses) VALUES ('FIXTURE','Fixture','fixed',100,1)");
      await pool.query(`CREATE FUNCTION fixture_booking_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$;
        CREATE TRIGGER fixture_failure BEFORE INSERT ON rides FOR EACH ROW EXECUTE FUNCTION fixture_booking_failure()`);
      await assert.rejects(rides.createRide(p3.id,{...body,promotionCode:'FIXTURE'}));
      assert.equal((await pool.query("SELECT uses_count FROM promotions WHERE code='FIXTURE'")).rows[0].uses_count,0);
      await pool.query('DROP TRIGGER fixture_failure ON rides');
      const results=await Promise.allSettled([p3,p4].map(p=>rides.createRide(p.id,{...body,promotionCode:'FIXTURE'})));
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal((await pool.query("SELECT uses_count FROM promotions WHERE code='FIXTURE'")).rows[0].uses_count,1);
    });
    await check('failed ride PIN attempts persist and lock out after five guesses', async () => {
      const ride=(await pool.query("SELECT * FROM rides WHERE driver_id=$1 LIMIT 1",[driver.id])).rows[0];
      await pool.query("UPDATE rides SET status='driverArrived' WHERE id=$1",[ride.id]);
      const pin=await rides.generateRidePin(ride.id);
      const wrong=pin==='0000'?'1111':'0000';
      for(let n=0;n<5;n++) await assert.rejects(ops.verifyPin(driver.id,ride.id,wrong),e=>e.status===400);
      await assert.rejects(ops.verifyPin(driver.id,ride.id,pin),e=>e.status===429);
      assert.equal((await pool.query('SELECT pin_attempts FROM rides WHERE id=$1',[ride.id])).rows[0].pin_attempts,5);
    });
    await check('booking key cannot silently replay a different itinerary', async () => {
      await assert.rejects(rides.createRide(p2.id,{...body,bookingKey:'same-key',destination:{...body.destination,latitude:-2.7}}),e=>e.status===409);
    });
    const express=require('express'),http=require('http');
    const app=express();app.use(express.json());app.use('/auth',require('../src/routes/auth.routes'));
    app.use('/wallet',require('../src/routes/wallet.routes'));app.use(require('../src/middleware/errorHandler').errorHandler);
    const listener=http.createServer(app);await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
    const {signToken}=require('../src/utils/jwt');
    const request=async(method,path,token,body)=>networkFetch(`http://127.0.0.1:${listener.address().port}${path}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:body?JSON.stringify(body):undefined});
    try {
      await check('phone change revokes verification and previous OTP; active ride blocks change', async () => {
        const p3=await passenger('100000007');const token=signToken(p3.id);
        const otp=require('../src/utils/otp');const code=await otp.issueCode(pool,{passengerId:p3.id,purpose:'signup'});
        assert.equal((await request('PUT','/auth/profile',token,{phone:'+2507100000008'})).status,200);
        assert.equal((await pool.query('SELECT verified_at FROM passengers WHERE id=$1',[p3.id])).rows[0].verified_at,null);
        assert.equal((await otp.verifyCode(pool,{passengerId:p3.id,purpose:'signup',code})).ok,false);
        assert.equal((await request('GET','/wallet',token)).status,403);
        const active=(await pool.query("SELECT passenger_id FROM rides WHERE status NOT IN ('completed','cancelled') LIMIT 1")).rows[0];
        assert.equal((await request('PUT','/auth/profile',signToken(active.passenger_id),{phone:'+2507100000009'})).status,409);
      });
      await check('password reset revokes existing sessions and enforces password policy', async () => {
        const p3=await passenger('100000010');const token=signToken(p3.id);
        const otp=require('../src/utils/otp');const code=await otp.issueCode(pool,{passengerId:p3.id,purpose:'reset'});
        assert.equal((await request('POST','/auth/reset-password/confirm',token,{identifier:p3.email,code,newPassword:'x'})).status,400);
        assert.equal((await request('POST','/auth/reset-password/confirm',token,{identifier:p3.email,code,newPassword:'updated-secret'})).status,200);
        assert.equal((await request('GET','/auth/me',token)).status,401);
        assert.equal((await request('GET','/auth/me',signToken(p3.id,1))).status,200);
      });
      await check('fractional wallet top-up is rejected before a charge is created', async () => {
        assert.equal((await request('POST','/wallet/topup',signToken(p.id),{phone:p.phone,amount:1234.4})).status,400);
        assert.equal((await pool.query('SELECT count(*)::int n FROM wallet_topups')).rows[0].n,0);
      });
    } finally {await new Promise(resolve=>listener.close(resolve));}
    console.log(`${passed} server regressions passed`);
  } finally {
    try { await db.getPool().end(); } catch {}
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.end();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});

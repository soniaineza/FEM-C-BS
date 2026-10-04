const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function loader(mocks, globals = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText;
    vm.runInNewContext(source, { module, exports: module.exports,
      require: id => {
        if (id in mocks) return mocks[id];
        if (id.startsWith('.')) {
          const base = path.resolve(path.dirname(file), id);
          return load(['.ts','.tsx','.js'].map(e => base+e).find(p => fs.existsSync(p)) || base);
        }
        throw new Error('Unexpected import ' + id);
      }, Date, setTimeout, clearTimeout, setInterval, clearInterval, console, AbortController,
      ...globals }, { filename: file });
    return module.exports;
  }
  return file => load(path.resolve(root, file));
}
const fix = (accuracy=10, age=0) => ({ timestamp: Date.now()-age,
  coords: { latitude: -1.9441, longitude: 30.0619, accuracy, heading: 0 } });
const tick = () => new Promise(r => setTimeout(r,0));
async function main() {
  let passed=0;
  async function check(name, fn) { await fn(); console.log('ok', ++passed, name); }
  const mocks = {
    '../services/api-client': {},
    './api-client': { apiClient: { get: async () => ({ address: 'Label' }) } },
    'expo-location': { PermissionStatus: { GRANTED:'granted' }, Accuracy: { High:4 },
      hasServicesEnabledAsync: async () => true,
      getForegroundPermissionsAsync: async () => ({status:'granted'}), },
  };
  await check('seed does not suppress fresh GPS; watcher is removed', async () => {
    let reads=0, removed=0;
    mocks['expo-location'].getLastKnownPositionAsync=async () => fix(20,90_000);
    mocks['expo-location'].watchPositionAsync=async (_opts,cb) => {reads++; cb(fix()); return {remove: () => removed++};};
    const service=loader(mocks)('services/location-service.ts');
    const seed=await service.getSeedPlace();
    assert.equal(seed.locationSource,'seed');
    await service.getCurrentPlace(); await tick();
    assert.equal(reads,1); assert.equal(removed,1);
  });
  await check('stale, unknown and coarse fixes never become GPS pickup', async () => {
    for(const sample of [fix(15,86_400_000),fix(3000),fix(null)]) {
      mocks['expo-location'].watchPositionAsync=async (_opts,cb,error) => {cb(sample); error('no fix'); return {remove(){}};};
      const service=loader(mocks)('services/location-service.ts');
      await assert.rejects(service.getCurrentPlace({force:true}), e => e.reason==='no-fix');
    }
  });
  await check('revoked permission invalidates cached access', async () => {
    mocks['expo-location'].watchPositionAsync=async (_opts,cb) => {cb(fix()); return {remove(){}};};
    const service=loader(mocks)('services/location-service.ts');
    await service.getCurrentPlace();
    mocks['expo-location'].getForegroundPermissionsAsync=async () => ({status:'denied'});
    await assert.rejects(service.getCurrentPlace(),e=>e.reason==='permission');
    mocks['expo-location'].getForegroundPermissionsAsync=async () => ({status:'granted'});
  });
  await check('late foreground subscription is removed after stop', async () => {
    let resolveWatch, removed=0;
    mocks['expo-location'].watchPositionAsync=() => new Promise(r => resolveWatch=r);
    const start=loader({...mocks,'react-native':{AppState:{currentState:'active'}}})('services/foreground-location.ts').watchForegroundLocation;
    const stop=start(async()=>{},()=>{},()=>{}); await tick(); stop();
    resolveWatch({remove:()=>removed++}); await tick(); assert.equal(removed,1);
  });
  await check('foreground uploads are ordered, coalesced and stop cleanly', async () => {
    let callback, release, removed=0;const reports=[],seen=[];
    mocks['expo-location'].watchPositionAsync=async(_opts,cb)=>{callback=cb;return{remove:()=>removed++};};
    const start=loader({...mocks,'react-native':{AppState:{currentState:'background'}}})('services/foreground-location.ts').watchForegroundLocation;
    const stop=start(async report=>{reports.push(report.measuredAt);if(reports.length===1) await new Promise(r=>release=r);},report=>seen.push(report.measuredAt),()=>{});
    await tick();const initial=fix();callback(initial);
    callback({...initial,timestamp:initial.timestamp-1});
    callback({...initial,timestamp:initial.timestamp+1});
    callback({...initial,timestamp:initial.timestamp+2});
    assert.deepEqual(reports,[initial.timestamp]);release();await tick();
    assert.deepEqual(reports,[initial.timestamp,initial.timestamp+2]);
    stop();callback({...initial,timestamp:initial.timestamp+3});
    assert.equal(seen.length,3);assert.equal(removed,1);
  });
  await check('coordinate boundaries accept zero and reject NaN/out of range', async () => {
    const {placeHasCoordinates}=loader({})('types/place.ts');
    assert.equal(placeHasCoordinates({latitude:0,longitude:0}),true);
    for(const latitude of [NaN,Infinity,91]) assert.equal(placeHasCoordinates({latitude,longitude:30}),false);
  });
  await check('response deadline includes a stalled body', async () => {
    const fetchResponse=loader({}, {fetch:async()=>({ok:true,status:200,text:()=>new Promise(()=>{})})})('services/http-response.ts').fetchResponse;
    await assert.rejects(fetchResponse('http://fixture',{},15),e=>e.name==='AbortError');
  });
  await check('malformed successful responses are rejected', async () => {
    const fetchResponse=loader({}, {fetch:async()=>({ok:true,status:200,text:async()=>'<html>error</html>'})})('services/http-response.ts').fetchResponse;
    await assert.rejects(fetchResponse('http://fixture',{},100));
  });
  console.log(`${passed} client regressions passed`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});

(function(){'use strict';
  var titleMap={drivers:'Drivers to approve',verified:'Verified drivers',newdriver:'Add a driver',activity:'Activity log',notes:'Shift notes',cases:'Payment cases',sos:'Emergencies / SOS',integrations:'Integrations'};
  function choose(tab){
    var title=document.getElementById('section-title'); if(title) title.textContent=titleMap[tab]||'Operations';
    document.querySelectorAll('.tab-strip [data-tab]').forEach(function(b){var active=b.getAttribute('data-tab')===tab;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('.side-nav [data-tab]').forEach(function(b){var active=b.getAttribute('data-tab')===tab;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
  }
  document.querySelectorAll('[data-tab]').forEach(function(b){b.addEventListener('click',function(){choose(b.getAttribute('data-tab'));});});
  var menu=document.getElementById('menu-toggle');if(menu)menu.addEventListener('click',function(){document.body.classList.toggle('menu-open');});
})();

/* Cierre de sesión por inactividad: lógica pura (sin DOM ni Firebase). Clásico (global) para el navegador y CommonJS para
   tests/idle.test.js. El reloj se inyecta (`now`) para poder probarlo sin esperar. */

// idleMs: tiempo sin actividad hasta el aviso. warnMs: duración del aviso antes de cerrar la sesión.
function createIdleGuard(opts){
  opts = opts || {};
  var idleMs = opts.idleMs || 30 * 60 * 1000, warnMs = opts.warnMs || 60 * 1000, now = opts.now || Date.now;
  var last = now(), warnAt = 0, expired = false;

  function fresh(){ warnAt = 0; expired = false; last = now(); }

  return {
    // Actividad del usuario. No cancela un aviso ya mostrado ni revive una sesión expirada: hay que pulsar "Seguir conectado".
    touch: function(){ if(!warnAt && !expired) last = now(); },
    // "Seguir conectado": vuelve a empezar la cuenta.
    stay: fresh,
    // Se llama una vez por segundo. Devuelve { state: 'active' | 'warn' | 'expired', left: segundos que quedan de aviso }.
    tick: function(signedIn){
      var n = now();
      if(!signedIn){ fresh(); return { state: 'active', left: 0 }; }
      if(expired) return { state: 'expired', left: 0 };
      if(!warnAt){
        var idle = n - last;
        // Pestaña dormida o ordenador suspendido: al volver ya pasó también el tiempo del aviso, se cierra sin más.
        if(idle >= idleMs + warnMs){ expired = true; return { state: 'expired', left: 0 }; }
        if(idle < idleMs) return { state: 'active', left: 0 };
        warnAt = n;
      }
      var left = Math.max(0, Math.ceil((warnMs - (n - warnAt)) / 1000));
      if(left <= 0){ expired = true; return { state: 'expired', left: 0 }; }
      return { state: 'warn', left: left };
    }
  };
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = { createIdleGuard: createIdleGuard };
}

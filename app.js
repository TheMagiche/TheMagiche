/**
 * Gehrman Sparrow - Interactive Character Companion
 * Engine implementing config.json rules, real-time mouse tracking,
 * dynamic blinking, and idle state transitions.
 */

(function () {
  'use strict';

  // Configuration (fallback default matching gherman_sparrow/config.json)
  const config = {
    name: 'gherman_sparrow',
    max_width: 180,
    max_height: 400,
    eyes: {
      travel_radius: 2,
      left: { x: 83, y: 101 },
      right: { x: 123, y: 101 }
    },
    blink: {
      enabled: true,
      every: [6, 12],
      duration: 0.18
    },
    click_squint: 0.3,
    idle: {
      yawn_after: 90,
      sleep_after: 240,
      random_every: [40, 90]
    }
  };

  // State
  let state = 'ACTIVE'; // 'ACTIVE', 'ACTION', 'SLEEPING'
  let blinkCount = 0;
  let lastActiveTimestamp = Date.now();
  let hasYawned = false;
  let nextRandomIdleTime = getRandomBetween(config.idle.random_every[0], config.idle.random_every[1]);
  let blinkTimeout = null;
  let actionTimeout = null;

  // Quotes
  const quotes = {
    active: [
      '"Be careful. The gray fog conceals many secrets."',
      '"A hunter must always remain vigilant."',
      '"I am merely a passing adventurer."',
      '"The Fool that doesn\'t belong to this era..."',
      '"A true hunter never reveals their trump card."'
    ],
    poke: [
      '"...What do you want?"',
      '"A sudden assault? Unwise."',
      '"Target sighted. Finger on the trigger."',
      '"Adjusting spectacles... observing target."'
    ],
    yawn: [
      '"Even above the gray fog, one grows weary..."',
      '"*yawns* Time for a cup of Follett coffee."',
      '"Pondering the next tarot gathering..."'
    ],
    idle: [
      '"Checking pocket watch..."',
      '"Glancing across Backlund\'s smog..."',
      '"Adjusting the cane and overcoat."'
    ],
    sleep: [
      '"Resting deep above the gray fog. Zzz..."',
      '"Meditating in the ancient palace..."',
      '"The spirit body is resting."'
    ],
    wake: [
      '"Back to reality. What is the situation?"',
      '"Awakened. A hunter never sleeps too deeply."'
    ]
  };

  // DOM Elements
  const stageWrapper = document.getElementById('stageWrapper');
  const characterContainer = document.getElementById('characterContainer');
  const eyeLeft = document.getElementById('eyeLeft');
  const eyeRight = document.getElementById('eyeRight');
  const layerBlink = document.getElementById('layerBlink');
  const layerAction = document.getElementById('layerAction');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const dialogueQuote = document.getElementById('dialogueQuote');

  // Stats Elements
  const statState = document.getElementById('statState');
  const statCursor = document.getElementById('statCursor');
  const statEyeLeft = document.getElementById('statEyeLeft');
  const statEyeRight = document.getElementById('statEyeRight');
  const statIdleTime = document.getElementById('statIdleTime');
  const statBlinks = document.getElementById('statBlinks');

  // Action Buttons
  const btnPoke = document.getElementById('btnPoke');
  const btnYawn = document.getElementById('btnYawn');
  const btnIdle = document.getElementById('btnIdle');
  const btnSleep = document.getElementById('btnSleep');
  const btnWake = document.getElementById('btnWake');

  // Helper functions
  function getRandomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function getRandomQuote(category) {
    const list = quotes[category] || quotes.active;
    return list[Math.floor(Math.random() * list.length)];
  }

  function setQuote(text) {
    if (dialogueQuote) {
      dialogueQuote.textContent = text;
    }
  }

  function updateStatus(label, dotClass = '') {
    if (statusText) statusText.textContent = label;
    if (statusDot) {
      statusDot.className = 'status-indicator ' + dotClass;
    }
    if (statState) statState.textContent = state;
  }

  function markActive() {
    if (state === 'SLEEPING') {
      wakeUp();
      return;
    }
    lastActiveTimestamp = Date.now();
    hasYawned = false;
  }

  // --- Eye Tracking Logic ---
  function updateEyeTracking(clientX, clientY) {
    if (state === 'SLEEPING' || state === 'ACTION') return;

    const rect = characterContainer.getBoundingClientRect();
    const scale = rect.width / 178; // Base width is 178px

    // Center of left & right eyes on screen
    const eyeLeftCenter = {
      x: rect.left + config.eyes.left.x * scale,
      y: rect.top + config.eyes.left.y * scale
    };

    const eyeRightCenter = {
      x: rect.left + config.eyes.right.x * scale,
      y: rect.top + config.eyes.right.y * scale
    };

    // Calculate left pupil offset
    const dxL = clientX - eyeLeftCenter.x;
    const dyL = clientY - eyeLeftCenter.y;
    const distL = Math.hypot(dxL, dyL);
    const radius = config.eyes.travel_radius;

    let offsetLX = 0;
    let offsetLY = 0;
    if (distL > 0) {
      const travelL = Math.min((distL / 80) * radius, radius);
      offsetLX = (dxL / distL) * travelL;
      offsetLY = (dyL / distL) * travelL;
    }

    // Calculate right pupil offset
    const dxR = clientX - eyeRightCenter.x;
    const dyR = clientY - eyeRightCenter.y;
    const distR = Math.hypot(dxR, dyR);

    let offsetRX = 0;
    let offsetRY = 0;
    if (distR > 0) {
      const travelR = Math.min((distR / 80) * radius, radius);
      offsetRX = (dxR / distR) * travelR;
      offsetRY = (dyR / distR) * travelR;
    }

    // Apply transforms
    eyeLeft.style.transform = `translate(${offsetLX.toFixed(2)}px, ${offsetLY.toFixed(2)}px)`;
    eyeRight.style.transform = `translate(${offsetRX.toFixed(2)}px, ${offsetRY.toFixed(2)}px)`;

    // Update telemetry
    if (statCursor) statCursor.textContent = `${Math.round(clientX)}, ${Math.round(clientY)}`;
    if (statEyeLeft) statEyeLeft.textContent = `${offsetLX.toFixed(1)}px, ${offsetLY.toFixed(1)}px`;
    if (statEyeRight) statEyeRight.textContent = `${offsetRX.toFixed(1)}px, ${offsetRY.toFixed(1)}px`;
  }

  // --- Blinking Logic ---
  function scheduleNextBlink() {
    if (!config.blink.enabled) return;
    clearTimeout(blinkTimeout);

    const delaySeconds = getRandomBetween(config.blink.every[0], config.blink.every[1]);
    blinkTimeout = setTimeout(() => {
      triggerBlink();
    }, delaySeconds * 1000);
  }

  function triggerBlink() {
    if (state !== 'ACTIVE') {
      scheduleNextBlink();
      return;
    }

    layerBlink.classList.add('active');
    blinkCount++;
    if (statBlinks) statBlinks.textContent = blinkCount;

    setTimeout(() => {
      layerBlink.classList.remove('active');
      scheduleNextBlink();
    }, config.blink.duration * 1000);
  }

  // --- Action Animations ---
  function playActionAnimation(gifSrc, durationMs, quoteCategory, onComplete) {
    clearTimeout(actionTimeout);
    state = 'ACTION';
    updateStatus('Action: ' + quoteCategory, 'idle');
    setQuote(getRandomQuote(quoteCategory));

    // Reset eye transform to center during action
    eyeLeft.style.transform = 'translate(0px, 0px)';
    eyeRight.style.transform = 'translate(0px, 0px)';

    // Cache-bust GIF to ensure it plays from frame 0
    layerAction.src = `${gifSrc}?t=${Date.now()}`;
    layerAction.classList.add('active');

    actionTimeout = setTimeout(() => {
      layerAction.classList.remove('active');
      state = 'ACTIVE';
      updateStatus('Observing your cursor...', '');
      if (onComplete) onComplete();
    }, durationMs);
  }

  function triggerPoke() {
    markActive();
    // click1.gif is 3 frames: 900+150+500 = 1550ms
    playActionAnimation('gherman_sparrow/click1.gif', 1550, 'poke');
  }

  function triggerYawn() {
    hasYawned = true;
    // yawn.gif is 2 frames: 500+900 = 1400ms
    playActionAnimation('gherman_sparrow/yawn.gif', 1400, 'yawn');
  }

  function triggerRandomIdle() {
    const isIdle1 = Math.random() > 0.5;
    const gif = isIdle1 ? 'gherman_sparrow/idle1.gif' : 'gherman_sparrow/idle2.gif';
    const duration = isIdle1 ? 1400 : 700;
    playActionAnimation(gif, duration, 'idle');
  }

  function triggerSleep() {
    clearTimeout(actionTimeout);
    state = 'ACTION';
    updateStatus('Falling asleep...', 'sleep');
    setQuote(getRandomQuote('sleep'));

    // sleep_in.gif: 2 frames = 800ms
    layerAction.src = `gherman_sparrow/sleep_in.gif?t=${Date.now()}`;
    layerAction.classList.add('active');

    actionTimeout = setTimeout(() => {
      state = 'SLEEPING';
      layerAction.src = 'gherman_sparrow/sleep.png';
      updateStatus('Sleeping (Resting above fog)', 'sleep');
    }, 800);
  }

  function wakeUp() {
    if (state !== 'SLEEPING') return;

    clearTimeout(actionTimeout);
    state = 'ACTION';
    updateStatus('Waking up...', 'idle');
    setQuote(getRandomQuote('wake'));

    // sleep_out.gif: 2 frames = 600ms
    layerAction.src = `gherman_sparrow/sleep_out.gif?t=${Date.now()}`;
    layerAction.classList.add('active');

    actionTimeout = setTimeout(() => {
      layerAction.classList.remove('active');
      state = 'ACTIVE';
      lastActiveTimestamp = Date.now();
      hasYawned = false;
      updateStatus('Observing your cursor...', '');
      scheduleNextBlink();
    }, 600);
  }

  // --- Inactivity / Idle Timer ---
  function checkIdleState() {
    const elapsedSeconds = Math.floor((Date.now() - lastActiveTimestamp) / 1000);
    if (statIdleTime) {
      statIdleTime.textContent = `${elapsedSeconds}s / ${config.idle.sleep_after}s`;
    }

    if (state === 'ACTIVE') {
      if (elapsedSeconds >= config.idle.sleep_after) {
        triggerSleep();
      } else if (elapsedSeconds >= config.idle.yawn_after && !hasYawned) {
        triggerYawn();
      } else if (elapsedSeconds >= nextRandomIdleTime && elapsedSeconds < config.idle.yawn_after) {
        triggerRandomIdle();
        nextRandomIdleTime = elapsedSeconds + getRandomBetween(config.idle.random_every[0], config.idle.random_every[1]);
      }
    }
  }

  // --- Event Listeners ---
  window.addEventListener('mousemove', (e) => {
    markActive();
    updateEyeTracking(e.clientX, e.clientY);
  });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      markActive();
      updateEyeTracking(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  stageWrapper.addEventListener('click', () => {
    if (state === 'SLEEPING') {
      wakeUp();
    } else if (state === 'ACTIVE') {
      triggerPoke();
    }
  });

  // Buttons
  if (btnPoke) btnPoke.addEventListener('click', triggerPoke);
  if (btnYawn) btnYawn.addEventListener('click', triggerYawn);
  if (btnIdle) btnIdle.addEventListener('click', triggerRandomIdle);
  if (btnSleep) btnSleep.addEventListener('click', triggerSleep);
  if (btnWake) btnWake.addEventListener('click', wakeUp);

  // Initialize
  scheduleNextBlink();
  setInterval(checkIdleState, 1000);

  // Random quotes periodically
  setInterval(() => {
    if (state === 'ACTIVE') {
      setQuote(getRandomQuote('active'));
    }
  }, 12000);

  // Try to load custom config if served via HTTP server
  fetch('gherman_sparrow/config.json')
    .then((res) => res.json())
    .then((customConfig) => {
      Object.assign(config, customConfig);
      console.log('Loaded custom Gehrman Sparrow config:', config);
    })
    .catch(() => {
      // Local fallback config already initialized
    });
})();

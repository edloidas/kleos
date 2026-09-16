/**
 * How the coin moves. No DOM and no three.js: the loop feeds it a clock and gets back
 * a pose, and the pointer adapter feeds it gestures in radians rather than in pixels.
 */

export interface MotionOptions {
  autoSpin: boolean;
  /** Idle spin, rad/s. */
  autoSpeed: number;
}

export interface Pose {
  /** Yaw, the spin itself. */
  angle: number;
  /** Pitch, the pointer tilt plus the idle sway. */
  pitch: number;
  /** Vertical float. */
  bob: number;
  /** Nothing will move again without input, so the render loop may stop. */
  settled: boolean;
}

export interface Advance {
  nowMs: number;
  deltaSeconds: number;
  reducedMotion: boolean;
}

export interface ShieldMotion {
  setAutoSpin(value: boolean, nowMs: number): void;
  toggleSpin(nowMs: number): void;
  nudge(impulse: number, nowMs: number): void;
  beginDrag(): void;
  dragBy(radians: number, nowMs: number): void;
  endDrag(nowMs: number): void;
  setTiltTarget(radians: number): void;
  advance(input: Advance): Pose;
}

/** How long after a gesture the idle spin picks up again. */
const IDLE_MS = 2200;
/** The flick a stopped spin is given so it turns to the front rather than jumping. */
const STOP_KICK = 11.5;
/** Below this the coin is close enough to rest for the settling spring to take over. */
const SETTLE_BELOW = 2.2;
const NEVER = -1e9;

export function createShieldMotion(options: MotionOptions): ShieldMotion {
  let angle = 0;
  let angularVelocity = 0;
  let dragging = false;
  let lastInteract = NEVER;
  let autoSpin = options.autoSpin;
  // π settles on whichever face is nearer; 2π only on the front.
  let settleStep = Math.PI;
  let tilt = 0;
  let tiltTarget = 0;
  let time = 0;

  return {
    setAutoSpin(value, nowMs) {
      autoSpin = value;
      lastInteract = value ? NEVER : nowMs;
    },

    toggleSpin(nowMs) {
      if (autoSpin) {
        autoSpin = false;
        settleStep = 2 * Math.PI;
        angularVelocity = (angularVelocity >= 0 ? 1 : -1) * STOP_KICK;
        lastInteract = nowMs;
      } else {
        autoSpin = true;
        settleStep = Math.PI;
        lastInteract = NEVER;
      }
    },

    nudge(impulse, nowMs) {
      angularVelocity += impulse;
      lastInteract = nowMs;
    },

    beginDrag() {
      dragging = true;
      angularVelocity = 0;
      settleStep = Math.PI;
    },

    dragBy(radians, nowMs) {
      angle += radians;
      angularVelocity = angularVelocity * 0.6 + radians * 60 * 0.4;
      lastInteract = nowMs;
    },

    endDrag(nowMs) {
      dragging = false;
      lastInteract = nowMs;
    },

    setTiltTarget(radians) {
      tiltTarget = radians;
    },

    advance({ nowMs, deltaSeconds, reducedMotion }) {
      time += deltaSeconds;

      if (!dragging) {
        if (autoSpin && nowMs - lastInteract > IDLE_MS && !reducedMotion) {
          angularVelocity +=
            (options.autoSpeed - angularVelocity) * Math.min(1, deltaSeconds * 1.5);
        } else {
          angularVelocity *= Math.exp(-2.2 * deltaSeconds);

          if (Math.abs(angularVelocity) < SETTLE_BELOW) {
            // settle like a coin coming to rest
            const target = Math.round(angle / settleStep) * settleStep;
            angularVelocity += (target - angle) * 22 * deltaSeconds;
            angularVelocity *= Math.exp(-5 * deltaSeconds);
          }
        }

        angle += angularVelocity * deltaSeconds;
      }

      tilt += (tiltTarget - tilt) * Math.min(1, deltaSeconds * 4);

      const sway = reducedMotion ? 0 : Math.sin(time * 0.9) * 0.05;
      const bob = reducedMotion ? 0 : Math.sin(time * 1.3) * 0.03;

      return {
        angle,
        pitch: tilt + sway,
        bob,
        // Only under reduced motion: otherwise the sway and the bob never stop.
        settled:
          reducedMotion &&
          !dragging &&
          Math.abs(angularVelocity) < 0.01 &&
          Math.abs(tiltTarget - tilt) < 1e-4,
      };
    },
  };
}

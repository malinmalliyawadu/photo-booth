"use client";

import { useEffect, useMemo } from "react";

/**
 * The booth's three sounds, synthesised on the spot with the Web Audio
 * API rather than fetched as files: a soft tick for each second of the
 * countdown, a shutter when the photo is taken, and a two-note chime
 * when the print is ready. iPadOS keeps audio silent until a gesture
 * has touched the context, so `unlock` runs on the first tap of a
 * session (the attract loop) and is harmless any other time.
 */
export interface Sounds {
  unlock(): void;
  tick(last: boolean): void;
  shutter(): void;
  chime(): void;
}

const SILENT: Sounds = { unlock() {}, tick() {}, shutter() {}, chime() {} };

class WebAudioSounds implements Sounds {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;

  private context(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  unlock() {
    const ctx = this.context();
    if (ctx && ctx.state !== "running") void ctx.resume();
  }

  private ready(): AudioContext | null {
    const ctx = this.context();
    return ctx && ctx.state === "running" ? ctx : null;
  }

  /** A short sine blip; the last second rings a fifth higher. */
  tick(last: boolean) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(last ? 1318 : 880, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(last ? 0.22 : 0.14, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + (last ? 0.28 : 0.12));
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  /** A click and a burst of filtered noise: the leaf shutter of a film camera. */
  shutter() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = "square";
    click.frequency.setValueAtTime(2200, t);
    click.frequency.exponentialRampToValueAtTime(400, t + 0.03);
    clickGain.gain.setValueAtTime(0.12, t);
    clickGain.gain.exponentialRampToValueAtTime(0.0005, t + 0.035);
    click.connect(clickGain).connect(ctx.destination);
    click.start(t);
    click.stop(t + 0.04);

    const burst = ctx.createBufferSource();
    burst.buffer = this.noiseBuffer(ctx);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2800;
    band.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.11);
    burst.connect(band).connect(gain).connect(ctx.destination);
    burst.start(t);
    burst.stop(t + 0.12);
  }

  /** Two notes a major third apart, with a soft tail: the print is ready. */
  chime() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [freq, at] of [
      [784, 0],
      [988, 0.13],
    ] as const) {
      for (const detune of [-4, 4]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t + at);
        osc.detune.setValueAtTime(detune, t + at);
        gain.gain.setValueAtTime(0, t + at);
        gain.gain.linearRampToValueAtTime(0.09, t + at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0005, t + at + 0.9);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t + at);
        osc.stop(t + at + 1);
      }
    }
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const length = Math.floor(ctx.sampleRate * 0.15);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    return buffer;
  }
}

/** The booth's sounds, or silence when the attendant switched them off. */
export function useSounds(enabled: boolean): Sounds {
  const live = useMemo(() => new WebAudioSounds(), []);
  const sounds = enabled ? live : SILENT;
  // Any tap on the kiosk is a gesture that may unlock audio, so the
  // first tick of a session is not the one that is silent.
  useEffect(() => {
    if (!enabled) return;
    const unlock = () => live.unlock();
    window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", unlock, { capture: true });
  }, [enabled, live]);
  return sounds;
}

'use client';
// WebDAQ demo overlay #4b (design §2.3): the start page. Upstream this file only
// redirects to /auth/login. Minimal version (phase P1); the designed start page
// with the tour and the scenario panel comes with phase P4.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { control } from '@/demo/shim/transport';

const DETECTORS = [
  ['hpge', '2 × HPGe (germanium) — DPP-PHA'],
  ['bgo', '2 × BGO scintillators — DPP-PSD'],
  ['ej309', '2 × liquid scintillators (EJ-309-like) — DPP-PSD, n/γ'],
  ['he3', '2 × ³He counters — DPP-PSD'],
] as const;
const SOURCES = [
  ['co60', '⁶⁰Co'], ['cs137', '¹³⁷Cs'], ['background', 'Room background only'],
  ['n14pg', 'In-beam ¹⁴N(p,γ)¹⁵O'], ['cf252', '²⁵²Cf (neutrons, for EJ-309)'],
] as const;

export default function Home() {
  const router = useRouter();
  const [detectors, setDetectors] = useState<string>('hpge');
  const [source, setSource] = useState<string>('co60');
  const [distance, setDistance] = useState<number>(10);
  const [error, setError] = useState('');

  async function start() {
    setError('');
    const res = await control({ type: 'scenario', scenario: { detectors, source, distance_cm: distance } });
    if (res && res.ok === false) { setError(res.message); return; }
    router.push('/dashboard');
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10 space-y-6">
      <p role="note" className="rounded border px-3 py-2 text-sm">
        Demo — simulated detectors · runs in your browser · nothing here is real hardware
      </p>
      <h1 className="text-2xl font-semibold">WebDAQ, simulated</h1>
      <p className="text-sm text-muted-foreground">
        The real WebDAQ interface, talking to a simulated DAQ server inside this page.
      </p>
      <fieldset className="space-y-2">
        <legend className="font-medium">Detectors (on one simulated V1730, channels 0 and 1)</legend>
        {DETECTORS.map(([v, label]) => (
          <label key={v} className="flex items-center gap-2 text-sm">
            <input type="radio" name="detectors" value={v} checked={detectors === v} onChange={() => setDetectors(v)} /> {label}
          </label>
        ))}
      </fieldset>
      <label className="block text-sm">
        <span className="font-medium">Source</span>
        <select className="mt-1 block w-full rounded border bg-background px-2 py-1" value={source} onChange={e => setSource(e.target.value)}>
          {SOURCES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium">Source–detector distance: {distance} cm</span>
        <input className="mt-1 block w-full" type="range" min={1} max={50} step={1} value={distance} onChange={e => setDistance(Number(e.target.value))} />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className="rounded bg-primary px-4 py-2 text-primary-foreground" onClick={start}>Open WebDAQ</button>
    </main>
  );
}

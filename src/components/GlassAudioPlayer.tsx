import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2 } from "lucide-react";

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Props = {
  src: string;
  className?: string;
};

export function GlassAudioPlayer({ src, className = "" }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setDuration(0);
    setError("");
  }, [src]);

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      void el.play().then(() => setPlaying(true)).catch(() => setError("Не удалось воспроизвести"));
    }
  }

  function onTimeUpdate() {
    const el = audioRef.current;
    if (!el) return;
    setProgress(el.currentTime);
  }

  function onLoaded() {
    const el = audioRef.current;
    if (!el) return;
    setDuration(el.duration || 0);
  }

  function onSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const el = audioRef.current;
    if (!el) return;
    const t = Number(e.target.value);
    el.currentTime = t;
    setProgress(t);
  }

  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className={`glass-call-player ${className}`}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoaded}
        onEnded={() => setPlaying(false)}
        onError={() => setError("Запись недоступна")}
      />
      <button type="button" className="glass-call-player-btn" onClick={toggle} aria-label={playing ? "Пауза" : "Воспроизвести"}>
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="glass-call-player-track min-w-0 flex-1">
        <div className="glass-call-player-times crm-data">
          <span>{fmt(progress)}</span>
          <span className="opacity-50">{fmt(duration)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={progress}
          onChange={onSeek}
          className="glass-call-player-range"
          style={{ "--pct": `${pct}%` } as React.CSSProperties}
        />
      </div>
      <Volume2 className="w-3.5 h-3.5 opacity-40 shrink-0" />
      {error && <span className="text-[10px] text-rose-500 crm-data">{error}</span>}
    </div>
  );
}

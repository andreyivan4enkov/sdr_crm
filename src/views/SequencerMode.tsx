import { useMemo } from "react";
import type { CrmData } from "../hooks/useCrmData";
import { useTheme } from "../context/ThemeProvider";
import { buildSequencerQueue } from "../sequencer/sdr-queue";
import { RadialSequencer } from "../sequencer/RadialSequencer";

type Props = {
  open: boolean;
  onClose: () => void;
  data: CrmData | null;
};

export function SequencerMode({ open, onClose, data }: Props) {
  const { theme } = useTheme();

  const queue = useMemo(() => (data ? buildSequencerQueue(data) : []), [data]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] md:max-w-[520px] md:mx-auto md:left-0 md:right-0 h-[100dvh]"
      style={{ touchAction: "none" }}
      role="dialog"
      aria-modal
      aria-label="Радиальный секвенсор"
    >
      <RadialSequencer colorMode={theme.colorMode} queue={queue} onClose={onClose} />
    </div>
  );
}

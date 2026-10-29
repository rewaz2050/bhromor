"use client";

import { useEffect, useRef, useState } from "react";
import type { RiderTask } from "@/lib/rider-tasks";
import { PinModal } from "./pin-modal";

interface DeliveryPinDialogProps {
  tasks: RiderTask[];
  selectedId: string | null;
  onSubmit: (task: RiderTask, pin: string, proofUrl: string | null, reason: string | null) => Promise<string | null>;
  onDelivered: (task: RiderTask, proofUrl: string | null) => void;
  onClose: () => void;
  onFlash: (message: string) => void;
}

/** Keep this rider/session owner mounted even when its form is closed. */
export function DeliveryPinDialog({ tasks, selectedId, onSubmit, onDelivered, onClose, onFlash }: DeliveryPinDialogProps) {
  const task = tasks.find(item => item.id === selectedId) ?? null;
  const taskId = task?.id;
  const owner = useRef({ active: false, generation: 0, selectedId, pending: new Set<string>() });
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const state = owner.current;
    state.active = true;
    return () => { state.active = false; state.generation++; };
  }, []);
  useEffect(() => {
    const state = owner.current;
    // A new selection/form appearance is a new view. Disappearance alone can
    // be the delivery helper's own successful refresh, before it returns.
    if (state.selectedId !== selectedId || taskId) state.generation++;
    state.selectedId = selectedId;
  }, [selectedId, taskId]);

  const close = () => {
    owner.current.generation++;
    owner.current.selectedId = null;
    onClose();
  };
  const submit = async (submittedTask: RiderTask, pin: string, proofUrl: string | null, reason: string | null): Promise<string | null> => {
    const state = owner.current;
    if (!state.active || state.selectedId !== submittedTask.id || state.pending.has(submittedTask.id)) return null;
    const generation = state.generation;
    state.pending.add(submittedTask.id);
    setPending(new Set(state.pending));
    let refusal: string | null;
    try {
      refusal = await onSubmit(submittedTask, pin, proofUrl, reason);
    } catch {
      refusal = "ডেলিভারি সম্পন্ন করা যায়নি — আবার চেষ্টা করুন।";
    } finally {
      // Locks belong to assignment transports, not whichever form is visible.
      state.pending.delete(submittedTask.id);
      if (state.active) setPending(new Set(state.pending));
    }
    if (!state.active || state.generation !== generation || state.selectedId !== submittedTask.id) return null;
    if (refusal === null) onDelivered(submittedTask, proofUrl);
    return refusal;
  };

  return task ? (
    <PinModal
      key={task.id}
      busy={pending.has(task.id)}
      onSubmit={(pin, proofUrl, reason) => submit(task, pin, proofUrl, reason)}
      onClose={close}
      onFlash={onFlash}
    />
  ) : null;
}

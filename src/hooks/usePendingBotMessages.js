import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { handleBotMessage } from '@/lib/sendBotMessage';
import { useQueryClient } from '@tanstack/react-query';

export function usePendingBotMessages() {
  const queryClient = useQueryClient();
  const busyRef = useRef(false);
  const handledRef = useRef(new Set());
  const pendingRef = useRef(new Map());
  const timerRef = useRef(null);

  useEffect(() => {
    const processQueue = async () => {
      if (busyRef.current) return;
      const entries = Array.from(pendingRef.current.entries());
      pendingRef.current.clear();
      if (entries.length === 0) return;

      busyRef.current = true;
      for (const [requestId, trigger] of entries) {
        const key = `${requestId}:${trigger}`;
        if (handledRef.current.has(key)) continue;
        handledRef.current.add(key);
        try {
          const sent = await handleBotMessage(requestId, { skipIfNoTrigger: true, trigger });
          if (sent) {
            queryClient.invalidateQueries({ queryKey: ['service-requests'] });
          }
        } catch (err) {
          console.warn('usePendingBotMessages: error', err.message);
        }
      }
      busyRef.current = false;
    };

    const unsubscribe = base44.entities.ServiceRequest.subscribe((event) => {
      if (event.type !== 'update') return;
      const trigger = event.data?.pending_bot_message;
      if (!trigger) return;
      const requestId = event.id;
      const key = `${requestId}:${trigger}`;
      if (handledRef.current.has(key)) return;
      pendingRef.current.set(requestId, trigger);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(processQueue, 2000);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [queryClient]);
}
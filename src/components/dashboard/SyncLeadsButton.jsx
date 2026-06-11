import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function SyncLeadsButton() {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await base44.functions.invoke('syncLeadsFromSheets', {});
      const d = res.data;
      toast.success(`סנכרון הושלם: ${d.website || 0} לידים מהאתר, ${d.webinar || 0} מוובינר (${d.skipped_duplicates || 0} כפולים דולגו)`);
    } catch (error) {
      toast.error('שגיאה בסנכרון: ' + (error.response?.data?.error || error.message));
    }
    setSyncing(false);
  };

  return (
    <Button variant="outline" onClick={handleSync} disabled={syncing} className="gap-2">
      <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
      {syncing ? 'מסנכרן...' : 'סנכרן לידים'}
    </Button>
  );
}
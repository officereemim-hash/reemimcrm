import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Image, File, ExternalLink, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const fileTypeIcon = (type) => {
  if (type === 'image') return Image;
  if (type === 'pdf' || type === 'doc' || type === 'docx') return FileText;
  return File;
};

export default function FilesList({ serviceRequestId }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: files = [] } = useQuery({
    queryKey: ['request-files', serviceRequestId],
    queryFn: () => base44.entities.ServiceRequestFile.filter({ service_request_id: serviceRequestId }, '-created_date', 50),
    enabled: !!serviceRequestId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      setUploading(true);
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const ext = file.name.split('.').pop().toLowerCase();
      let file_type = 'other';
      if (['pdf'].includes(ext)) file_type = 'pdf';
      else if (['doc', 'docx'].includes(ext)) file_type = ext;
      else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) file_type = 'image';
      await base44.entities.ServiceRequestFile.create({ service_request_id: serviceRequestId, file_name: file.name, file_uri, file_url: '', file_type, uploaded_by: 'admin' });
      await base44.entities.ServiceRequestTimeline.create({ service_request_id: serviceRequestId, event_type: 'file_received', description: `קובץ הועלה: ${file.name}` });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request-files', serviceRequestId] });
      queryClient.invalidateQueries({ queryKey: ['sr-timeline', serviceRequestId] });
      setUploading(false);
      toast.success('הקובץ הועלה');
    },
    onError: () => setUploading(false),
  });

  const openDoc = async (doc) => {
    if (!doc.file_uri) { window.open(doc.file_url, '_blank', 'noopener'); return; }
    const w = window.open('', '_blank');
    try {
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: doc.file_uri, expires_in: 300 });
      if (w) w.location.href = signed_url;
      else window.location.href = signed_url; // חוסם חלונות — פותחים באותה לשונית
    } catch (e) { w?.close(); alert('לא הצלחתי לפתוח את הקובץ'); }
  };

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ServiceRequestFile.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['request-files', serviceRequestId] }); toast.success('נמחק'); },
  });

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-lg">קבצים מצורפים</CardTitle>
        <div>
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate(f); }} />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-1">
            <Upload className="w-3.5 h-3.5" /> {uploading ? 'מעלה...' : 'העלה קובץ'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">אין קבצים</p>
        ) : (
          <div className="space-y-2">
            {files.map((file) => {
              const Icon = fileTypeIcon(file.file_type);
              return (
                <div key={file.id} className="flex items-center gap-3 p-2 border rounded-lg hover:bg-muted/30">
                  <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.file_name}</p>
                    <div className="flex gap-2 mt-0.5">
                      <Badge variant="outline" className="text-xs">{file.file_type}</Badge>
                      <Badge variant="secondary" className="text-xs">{file.uploaded_by === 'admin' ? 'אדמין' : 'משתמש'}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {(file.file_uri || file.file_url) && (
                      <Button size="icon" variant="ghost" onClick={() => openDoc(file)}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(file.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
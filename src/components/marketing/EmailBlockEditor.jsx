import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, ChevronUp, ChevronDown, Type, Image as ImageIcon, MousePointer, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const BLOCK_TYPES = [
  { key: 'text', label: 'טקסט', icon: Type },
  { key: 'image', label: 'תמונה', icon: ImageIcon },
  { key: 'button', label: 'כפתור', icon: MousePointer },
];

export default function EmailBlockEditor({ blocks, onChange }) {
  const [uploadingIdx, setUploadingIdx] = useState(null);

  const newBlock = (type) => ({
    id: Date.now() + Math.random(),
    type,
    title: '',
    content: '',
    button_text: '',
    button_url: '',
    image_url: '',
  });

  const updateBlock = (idx, field, value) => {
    const updated = [...blocks];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange(updated);
  };

  const removeBlock = (idx) => {
    onChange(blocks.filter((_, i) => i !== idx));
  };

  const moveBlock = (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= blocks.length) return;
    const updated = [...blocks];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    onChange(updated);
  };

  const addBlock = (type) => {
    onChange([...blocks, newBlock(type)]);
  };

  const handleImageUpload = async (idx, file) => {
    if (!file) return;
    setUploadingIdx(idx);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    updateBlock(idx, 'image_url', file_url);
    setUploadingIdx(null);
  };

  return (
    <div className="space-y-3">
      {blocks.map((block, idx) => (
        <div key={block.id || idx} className="border border-border rounded-lg p-3 bg-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">
              {BLOCK_TYPES.find(t => t.key === block.type)?.label || 'בלוק'}
            </span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => moveBlock(idx, -1)} className="p-1 hover:bg-muted rounded" disabled={idx === 0}>
                <ChevronUp size={14} />
              </button>
              <button type="button" onClick={() => moveBlock(idx, 1)} className="p-1 hover:bg-muted rounded" disabled={idx === blocks.length - 1}>
                <ChevronDown size={14} />
              </button>
              <button type="button" onClick={() => removeBlock(idx)} className="p-1 hover:bg-destructive/10 text-destructive rounded">
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {block.type === 'text' && (
            <div className="space-y-2">
              <Input
                placeholder="כותרת (אופציונלי)"
                value={block.title || ''}
                onChange={e => updateBlock(idx, 'title', e.target.value)}
              />
              <Textarea
                placeholder="תוכן הבלוק..."
                value={block.content || ''}
                onChange={e => updateBlock(idx, 'content', e.target.value)}
                rows={3}
              />
            </div>
          )}

          {block.type === 'image' && (
            <div className="space-y-2">
              {block.image_url ? (
                <div className="relative">
                  <img src={block.image_url} alt="תמונה" className="w-full rounded-lg max-h-40 object-cover" />
                  <button
                    type="button"
                    onClick={() => updateBlock(idx, 'image_url', '')}
                    className="absolute top-1 left-1 bg-destructive text-destructive-foreground rounded-full p-1"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:bg-muted/50 transition-colors">
                  {uploadingIdx === idx ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      <ImageIcon size={16} className="text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">לחצי להעלאת תמונה</span>
                    </>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(idx, e.target.files[0])} />
                </label>
              )}
            </div>
          )}

          {block.type === 'button' && (
            <div className="space-y-2">
              <Input
                placeholder="טקסט הכפתור"
                value={block.button_text || ''}
                onChange={e => updateBlock(idx, 'button_text', e.target.value)}
              />
              <Input
                placeholder="קישור (URL)"
                value={block.button_url || ''}
                onChange={e => updateBlock(idx, 'button_url', e.target.value)}
                dir="ltr"
              />
            </div>
          )}
        </div>
      ))}

      {/* Add block buttons */}
      <div className="flex gap-2 flex-wrap">
        {BLOCK_TYPES.map(bt => (
          <Button
            key={bt.key}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addBlock(bt.key)}
            className="gap-1 text-xs"
          >
            <Plus size={12} />
            <bt.icon size={12} />
            {bt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
import { LayoutGrid, Table2, Columns3 } from 'lucide-react';

export default function ViewToggle({ view, onViewChange, showKanban = false }) {
  const views = [
    { key: 'table', label: 'טבלה', icon: Table2 },
    { key: 'cards', label: 'כרטיסים', icon: LayoutGrid },
  ];
  if (showKanban) views.push({ key: 'kanban', label: 'קאנבן', icon: Columns3 });

  return (
    <div className="flex gap-1 border rounded-lg p-0.5">
      {views.map(v => {
        const Icon = v.icon;
        const active = view === v.key;
        return (
          <button
            key={v.key}
            onClick={() => onViewChange(v.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Icon size={14} />
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';

export default function StatCard({ label, value, icon: Icon, color, to, percent }) {
  const inner = (
    <Card className={`shadow-sm ${to ? 'hover:shadow-md hover:border-primary/30 hover:scale-[1.02] transition-all cursor-pointer' : ''}`}>
      <CardContent className="p-4">
        {Icon && (
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${color || ''}`}>
            <Icon size={16} />
          </div>
        )}
        {!Icon && <div className={`text-3xl font-bold ${color || ''}`}>{value}</div>}
        {Icon && <div className="text-2xl font-bold">{value}</div>}
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
        {percent !== undefined && <div className="text-xs text-muted-foreground">{percent}%</div>}
      </CardContent>
    </Card>
  );

  if (to) return <Link to={to} className="block">{inner}</Link>;
  return inner;
}
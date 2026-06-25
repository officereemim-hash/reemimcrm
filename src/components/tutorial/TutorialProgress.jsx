export default function TutorialProgress({ current, total }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className="h-1 rounded-full flex-1 transition-all duration-300"
          style={{
            backgroundColor: i <= current ? 'hsl(var(--primary))' : 'hsl(var(--border))',
            opacity: i <= current ? 1 : 0.4,
          }}
        />
      ))}
    </div>
  );
}
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <p className="text-4xl font-bold text-foreground">404</p>
      <p className="text-xs text-muted-foreground">This screen does not exist.</p>
      <Link to="/monitoring/matches" className="text-xs font-semibold text-primary underline">
        Back to monitoring
      </Link>
    </div>
  );
}

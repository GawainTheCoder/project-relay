import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <section className="max-w-md border-l border-relay-accent pl-6">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-relay-accent">
          404
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          This intelligence surface does not exist.
        </h1>
        <Link
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-relay-accent hover:text-white"
          to="/"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Return to today
        </Link>
      </section>
    </div>
  );
}

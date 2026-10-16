'use client';

import KanbanBoard from '@/components/kanban/KanbanBoard';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function KanbanPage() {
  return (
    <ErrorBoundary>
      <main className="mx-auto max-w-[100rem] p-4 md:p-6">
        <h1 className="mb-4 text-2xl font-bold">Deals &amp; Tasks Board</h1>
        <KanbanBoard />
      </main>
    </ErrorBoundary>
  );
}

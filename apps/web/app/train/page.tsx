'use client';

import { RequireAuth } from '@/components/require-auth';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';

function OperatorCard() {
  const { user } = useAuth();
  if (!user) return null;
  const rows: [string, string][] = [
    ['Name', user.name],
    ['Email', user.email ?? '—'],
    ['Unit', user.unit?.name ?? 'Unassigned'],
  ];
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Operator</CardTitle>
        <Badge tone="primary" data-testid="role">
          {user.role}
        </Badge>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="hud-label self-center">{k}</dt>
              <dd className="font-mono" data-testid={`user-${k.toLowerCase()}`}>
                {v}
              </dd>
            </div>
          ))}
          <dt className="hud-label self-center">Rating</dt>
          <dd className="num">{user.rating}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}

export default function TrainPage() {
  return (
    <RequireAuth>
      <div className="space-y-4">
        <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.2em]">Training</h1>
        <div className="grid gap-4 md:grid-cols-2">
          <OperatorCard />
          <Card>
            <CardHeader>
              <CardTitle>Scenarios</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Scenario select and the sim player arrive in Phase 1.
            </CardContent>
          </Card>
        </div>
      </div>
    </RequireAuth>
  );
}

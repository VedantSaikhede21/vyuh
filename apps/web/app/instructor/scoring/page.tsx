'use client';

import type { ScoreComponents, ScoringTreeSummary } from '@vyuh/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Panel, PanelBody, PanelHeader, Skeleton, StatusNotice } from '@/components/hud/primitives';
import { RequireStaff } from '@/components/require-staff';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// Scoring weight editor (SPEC §9.2, decision 121): weights only — the component
// maxima of a tree. Each save is a new immutable version; nothing is re-scored until
// an instructor re-scores a session explicitly (trainee trends, Re-score).

const TH = 'h-7 bg-bg-2 px-2 text-left text-label font-medium whitespace-nowrap';
const TD = 'h-8 px-2 whitespace-nowrap';
const KEYS: (keyof ScoreComponents)[] = [
  'detection',
  'classification',
  'decision',
  'report',
  'efficiency',
];
const LABEL: Record<keyof ScoreComponents, string> = {
  detection: 'Detection',
  classification: 'Classification',
  decision: 'Decision',
  report: 'Contact report',
  efficiency: 'Efficiency',
};

function Editor({ tree, onSaved }: { tree: ScoringTreeSummary; onSaved: (id: string) => void }) {
  const [w, setW] = useState<ScoreComponents>(tree.componentMax);
  const [note, setNote] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'error'; text?: string }>({
    kind: 'idle',
  });
  const changed = KEYS.some((k) => w[k] !== tree.componentMax[k]);
  const total = KEYS.reduce((a, k) => a + w[k], 0);
  const invalid = KEYS.filter((k) => tree.editable.includes(k) && !(w[k] >= 1 && w[k] <= 60));

  const save = () => {
    setState({ kind: 'busy' });
    api
      .saveWeights(tree.id, w, note.trim() || undefined)
      .then((v) => {
        setState({ kind: 'idle' });
        setNote('');
        onSaved(v.id);
      })
      .catch((err: unknown) =>
        setState({ kind: 'error', text: err instanceof Error ? err.message : 'Failed' }),
      );
  };

  return (
    <Panel>
      <PanelHeader title={`Weights · ${tree.id}`}>
        {tree.builtIn ? <Badge>Built-in</Badge> : <Badge tone="strong">Version</Badge>}
      </PanelHeader>
      <PanelBody className="space-y-3">
        <p className="text-small text-text-2">{tree.description}</p>
        <table className="w-full border-collapse" data-testid="weights">
          <thead>
            <tr>
              <th className={`${TH} w-full`}>Component</th>
              <th className={`${TH} text-right`}>Now</th>
              <th className={TH}>New weight</th>
              <th className={`${TH} text-right`}>Share</th>
            </tr>
          </thead>
          <tbody>
            {KEYS.map((k) => {
              const editable = tree.editable.includes(k);
              return (
                <tr key={k} className="border-t border-line-1">
                  <td className={`${TD} text-body`}>
                    {LABEL[k]}
                    {!editable && (
                      <span className="ml-2 text-small text-text-3">not scored by this tree</span>
                    )}
                  </td>
                  <td className={`${TD} text-right text-readout text-text-2`}>
                    {tree.componentMax[k]}
                  </td>
                  <td className={TD}>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      step={1}
                      aria-label={`${LABEL[k]} weight`}
                      aria-invalid={invalid.includes(k)}
                      disabled={!editable}
                      title={
                        editable ? '1 to 60 points' : 'This tree has no leaves for this component'
                      }
                      className="tnum h-7 w-20 px-2"
                      value={w[k]}
                      onChange={(e) => setW((x) => ({ ...x, [k]: Number(e.target.value) }))}
                    />
                  </td>
                  <td className={`${TD} text-right text-readout`}>
                    {total > 0 ? Math.round((100 * w[k]) / total) : 0}
                    <span className="text-text-3"> %</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-small text-text-3">
          Every leaf of a component scales with its weight; thresholds, penalties and the tree
          structure stay as in {tree.baseId}. Totals are still scaled to 100.
        </p>
        <label className="block space-y-1">
          <span className="text-label">Note (optional)</span>
          <Input
            value={note}
            maxLength={200}
            placeholder="Why these weights, e.g. 'Reports count double for the exercise'"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            disabled={!changed || invalid.length > 0 || state.kind === 'busy'}
            title={
              !changed
                ? 'Change a weight first'
                : invalid.length
                  ? 'Weights must be 1 to 60'
                  : 'Saves a new immutable version'
            }
            onClick={save}
            data-testid="save-weights"
          >
            {state.kind === 'busy' ? 'Saving…' : 'Save as new version'}
          </Button>
          {state.kind === 'error' && (
            <span className="text-small text-crit" role="alert">
              {state.text}
            </span>
          )}
        </div>
      </PanelBody>
    </Panel>
  );
}

function Scoring() {
  const [trees, setTrees] = useState<ScoringTreeSummary[] | null>(null);
  const [selected, setSelected] = useState<string>('default_v4');
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const load = useCallback((signal?: AbortSignal) => {
    api
      .listTrees(signal)
      .then((r) => setTrees(r.items))
      .catch((err: unknown) => {
        if (!signal?.aborted) setError(err instanceof Error ? err.message : 'Network error');
      });
  }, []);
  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);
  const tree = useMemo(() => trees?.find((t) => t.id === selected) ?? null, [trees, selected]);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-label">Instructor / Scoring weights</p>
        <h1 className="text-h1">Scoring weights</h1>
        <p className="text-body text-text-2">
          Saving creates a new version. Sessions keep the score they have; re-score one from a
          trainee&apos;s trends to compare.
        </p>
      </div>
      {error && (
        <Panel>
          <StatusNotice
            tone="error"
            title="Could not load scoring trees."
            onRetry={() => {
              setError(null);
              load();
            }}
          >
            {error}
          </StatusNotice>
        </Panel>
      )}
      {!trees && !error && <Skeleton label="Loading scoring trees" />}
      {trees && (
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Panel>
            <PanelHeader title="Versions">
              <span className="text-label">{trees.length}</span>
            </PanelHeader>
            <table className="w-full border-collapse" data-testid="tree-versions">
              <thead>
                <tr>
                  <th className={`${TH} w-full`}>Version</th>
                  <th className={TH}>Weights D/C/Dec/R</th>
                  <th className={`${TH} text-right`}>Scored</th>
                </tr>
              </thead>
              <tbody>
                {trees.map((t) => (
                  <tr
                    key={t.id}
                    tabIndex={0}
                    aria-selected={t.id === selected}
                    onClick={() => setSelected(t.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelected(t.id)}
                    className={cn(
                      'cursor-pointer border-t border-line-1 hover:bg-bg-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-select',
                      t.id === selected && 'bg-bg-3',
                    )}
                  >
                    <td className={`${TD} text-body`}>
                      <span className="text-readout">{t.id}</span>
                      {t.builtIn ? (
                        <span className="ml-2 text-small text-text-3">built-in</span>
                      ) : (
                        <span className="ml-2 text-small text-text-3">
                          from {t.derivedFrom} · {t.createdByName ?? '—'} ·{' '}
                          {t.createdAt?.slice(0, 10)}
                        </span>
                      )}
                      {savedId === t.id && (
                        <Badge className="ml-2" tone="ok">
                          Saved
                        </Badge>
                      )}
                    </td>
                    <td className={`${TD} text-readout text-text-2`}>
                      {t.componentMax.detection}/{t.componentMax.classification}/
                      {t.componentMax.decision}/{t.componentMax.report}
                    </td>
                    <td className={`${TD} text-right text-readout`}>{t.scoredSessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          {tree && (
            <Editor
              key={tree.id}
              tree={tree}
              onSaved={(id) => {
                setSavedId(id);
                setSelected(id);
                load();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function ScoringPage() {
  return (
    <RequireStaff>
      <Scoring />
    </RequireStaff>
  );
}

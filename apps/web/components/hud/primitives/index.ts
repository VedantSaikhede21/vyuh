// Shared HUD primitives (DESIGN §12). Feature code builds screens from these.
export { AffiliationSymbol } from './affiliation-symbol';
export { Banner } from './banner';
export { CommsLog, type CommsLine, type CommsStatus } from './comms-log';
export { CooldownRing } from './cooldown-ring';
export { Kbd } from './kbd';
export { Panel, PanelBody, PanelHeader } from './panel';
export { Pips } from './pips';
export { Readout } from './readout';
export { Skeleton, StatusNotice } from './skeleton';
export { StateChip } from './state-chip';
export { Tooltip } from '@/components/ui/tooltip';
export { ClassSilhouette, SILHOUETTE_FAMILY } from './class-silhouette';
export { DEMO_TITLE, DemoBadge, QualificationChip, type QualificationState } from './chips';
export { Breadcrumbs, FactStrip, PageHeader, type Crumb, type Fact } from './page-header';
export { SheetFrame, TelemetryStrip, type TelemetryItem } from './sheet';
export { StageStrip, type StageCell, type StageState } from './stage-strip';
export { EmptyState, ErrorState, LargerScreenNotice, SkeletonRows } from './states';

/** Short RF badge text for a track: band plus friendly ID code when one is heard. */
export function rfBadgeText(rf: { band: string | null; friendlyIdCode: string | null }): string {
  return `${rf.band ?? 'RF'}${rf.friendlyIdCode ? ` · ID ${rf.friendlyIdCode}` : ''}`;
}

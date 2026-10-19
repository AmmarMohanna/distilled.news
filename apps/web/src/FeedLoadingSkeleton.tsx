export function FeedLoadingSkeleton({ label, showSearch = false }: { label: string; showSearch?: boolean }) {
  return <div className="feed-loading-skeleton" role="status" aria-busy="true">
    {showSearch && <div className="feed-skeleton-search" aria-hidden="true"/>}
    <div className="feed-skeleton-panel">
      <div className="feed-skeleton-rows" aria-hidden="true">
        {[0, 1, 2].map(row => <div className="feed-skeleton-row" key={row}>
          <div className="feed-skeleton-thumbnail"/>
          <div className="feed-skeleton-copy"><span/><span/><span/><span/></div>
          <div className="feed-skeleton-tags"><span/><span/></div>
        </div>)}
      </div>
      <span className="feed-skeleton-label"><span className="feed-skeleton-spinner" aria-hidden="true"/>{label}</span>
    </div>
  </div>;
}

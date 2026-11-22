import { Link } from 'react-router-dom';
import { useResource } from './api.js';
import { CampaignReport } from './campaign-report.jsx';
import { Feedback, number, timestamp } from './ui.jsx';

export default function DepthAudit() {
  const { data, loading, error, reload } = useResource('/api/depth-audit', 20_000);
  return <div className="wrap page">
    <Link className="button secondary request-back" to="/depth-lab">Back to Depth Lab</Link>
    <header className="page-heading">
      <h1>Live depth audit</h1>
      <p>DepthDesk records real Metric quotes every five minutes. The audit is a public measurement run with no sponsor budget or curator offer.</p>
    </header>
    <Feedback loading={loading} error={error} retry={reload}>
      {data && <>
        <div className="toolbar audit-toolbar">
          <div><strong>{data.market.pair}</strong><p className="muted">{number(data.size, 0)} {data.market.quote} per side · Within {data.maxBps} bps of the pool midpoint</p></div>
          <div className="button-row">
            <Link className="button secondary" to={'/depth-lab?chain=' + data.market.chainId + '&pool=' + data.market.address + '&size=' + data.size}>Test this pool</Link>
            <Link className="button secondary" to={'/rwa?pool=' + data.market.address}>View stock reference</Link>
          </div>
        </div>
        <div className="audit-explanation">
          <p>The pass rate measures quoted depth relative to the pool. The stock column shows independent price alignment during the regular U.S. equity session.</p>
          {data.startedAt && <p>First retained sample {timestamp(data.startedAt)}. This report uses the last 24 hours.</p>}
        </div>
        {data.report.planned ? <CampaignReport report={data.report} target={data.target} benchmark="pool" title="Five-minute observations" showReference />
          : <Feedback empty="Waiting for the first scheduled observation." />}
      </>}
    </Feedback>
  </div>;
}

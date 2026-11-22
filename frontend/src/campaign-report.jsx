import { bps, number, PanelHeading, Status, timestamp } from './ui.jsx';

export function CampaignReport({ report, target, benchmark, showReference, title = 'Campaign report' }) {
  if (!report.planned) return null;
  return <section className="panel report">
    <PanelHeading title={title} trailing={<span className="muted numeric">{report.elapsed} / {report.planned} scheduled checks</span>} />
    <p className="report-benchmark">{benchmark === 'equity' ? 'Independent Robinhood stock midpoint, adjusted to token units' : 'Metric pool midpoint for two-sided depth and spread'}</p>
    <div className="report-stats">
      <div><span>Pass rate</span><strong>{report.passRate == null ? '—' : number(report.passRate, 1) + '%'}</strong><small>Target {target}%</small></div>
      <div><span>Passed</span><strong className="data-accent">{report.pass}</strong></div>
      <div><span>Failed</span><strong>{report.fail}</strong></div>
      <div><span>Unavailable</span><strong>{report.unavailable + report.missing}</strong><small>{report.missing} missed checks</small></div>
    </div>
    {report.elapsed > 0 && <div className="report-progress" role="img"
      aria-label={report.pass + ' passed, ' + report.fail + ' failed, ' + (report.unavailable + report.missing) + ' unavailable'}>
      {[['pass', report.pass], ['fail', report.fail], ['missing', report.missing + report.unavailable]].map(([state, count]) =>
        <span key={state} className={'report-segment ' + state} style={{ width: count / report.elapsed * 100 + '%' }} />)}
    </div>}
    <p className="panel-note">Pass rate uses all elapsed checks. Each observation uses quoted depth for the requested size.</p>
    {report.samples.length > 0 && <div className="table-scroll">
      <table className="list-table sample-table"><thead><tr><th>Observed</th><th>Buy vs. mid</th><th>Sell vs. mid</th>{showReference && <th>Pool vs. stock mid</th>}<th>Result</th></tr></thead>
        <tbody>{report.samples.map(sample => <tr key={sample.slotAt}><th scope="row">{timestamp(sample.observedAt)}</th>
          <td className="numeric">{bps(sample.buyBps)}</td><td className="numeric">{bps(sample.sellBps)}</td>
          {showReference && <td className="numeric">{sample.referenceMidBps != null ? bps(sample.referenceMidBps)
            : sample.referenceStatus && sample.referenceStatus !== 'live' ? <Status value={sample.referenceStatus} /> : '—'}</td>}
          <td className={sample.outcome === 'pass' ? 'data-accent' : 'muted'}>{sample.reason}</td></tr>)}</tbody>
      </table>
    </div>}
  </section>;
}

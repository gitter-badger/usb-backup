import * as globals from '../../../globals.js'
import { useJobLog } from '../hooks.js'

const html = window.html
const { useEffect, useState } = globals.preactHooks

export default function JobLog ({ jobId }) {
  const jobLog = useJobLog(jobId)
  const [filter, setFilter] = useState('all')

  const filteredLogs = jobLog.filter(({ type }) =>
    filter === 'all'
      ? true
      : filter === 'info'
        ? ['info', 'warn', 'error'].includes(type)
        : filter === 'warn'
          ? ['warn', 'error'].includes(type)
          : type === 'error')

  return html`
  <h1>Job Log</h1>
  <secton>
  <label for="min-log-level" class="form-label">Min Log Level</label>
  <select id="min-log-level" value=${filter} onChange=${x => setFilter(x.target.value)} class="form-select" aria-label="Min Log Level">
  <option value="all">All</option>
  <option value="info">Info</option>
  <option value="warn">Warn</option>
  <option value="error">Error</option>
</select>
</section>

  <table class="table table-striped">
  <thead>
      <tr>
          <th scope="col">Type</th>
          <th scope="col">Message</th>
      </tr>
  </thead>
  <tbody>
    ${filteredLogs.map(log => html`
      <tr>
        <td> ${log.type} </td>
        <td> ${log.message} </td>
      </tr>
    `)}
  </tbody>
</table>
  `
}

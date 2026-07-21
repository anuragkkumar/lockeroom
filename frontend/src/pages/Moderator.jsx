import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getModToken,
  setModToken,
  clearModToken,
  verifyToken,
  fetchReports,
  resolveReport,
  reopenReport,
} from '@/lib/modApi';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ArrowLeft,
  Check,
  RotateCcw,
  Loader2,
  Copy,
  LogOut,
  Flag,
} from 'lucide-react';
import { toast } from 'sonner';

function formatFullTime(ts) {
  try {
    return new Date(ts).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function shortId(id) {
  if (!id) return '';
  return id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).then(
    () => toast.success('Copied'),
    () => toast.error('Copy failed')
  );
}

function StatCard({ label, value, tone = 'neutral' }) {
  const toneCls =
    tone === 'open'
      ? 'text-[#f0b232]'
      : tone === 'resolved'
        ? 'text-[#23a559]'
        : 'text-[#f2f3f5]';
  return (
    <div className="rounded-lg border border-[#1e1f22] bg-[#2b2d31] px-5 py-4">
      <div className="font-mono-ui text-[10px] uppercase tracking-[0.25em] text-[#949ba4]">
        {label}
      </div>
      <div className={`mt-2 font-mono-ui text-3xl font-extrabold tabular-nums ${toneCls}`}>
        {value}
      </div>
    </div>
  );
}

export default function Moderator() {
  const navigate = useNavigate();
  const [token, setTokenLocal] = useState(getModToken());
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('open'); // open | resolved | all
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState({ total: 0, open: 0, resolved: 0 });
  const [actioningId, setActioningId] = useState(null);

  const tryAuth = useCallback(async (t) => {
    setChecking(true);
    const res = await verifyToken(t);
    setChecking(false);
    if (res.ok && res.data.ok) {
      setModToken(t);
      setAuthed(true);
      return true;
    }
    if (res.status === 503) {
      toast.error('Moderator mode is not configured on the server');
    } else {
      toast.error('Invalid moderator token');
    }
    return false;
  }, []);

  useEffect(() => {
    const existing = getModToken();
    if (existing) tryAuth(existing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async (s = status) => {
    setLoading(true);
    const res = await fetchReports(s);
    setLoading(false);
    if (!res.ok) {
      if (res.status === 401) {
        clearModToken();
        setAuthed(false);
        toast.error('Session expired. Sign in again.');
        return;
      }
      toast.error(res.data?.error || 'Failed to load reports');
      return;
    }
    setReports(res.data.reports || []);
    setStats(res.data.stats || { total: 0, open: 0, resolved: 0 });
  }, [status]);

  useEffect(() => {
    if (authed) load(status);
  }, [authed, status, load]);

  const handleResolve = async (id) => {
    setActioningId(id);
    const res = await resolveReport(id);
    setActioningId(null);
    if (!res.ok) {
      toast.error(res.data?.error || 'Failed to resolve');
      return;
    }
    toast.success(`Report #${id} resolved`);
    load(status);
  };

  const handleReopen = async (id) => {
    setActioningId(id);
    const res = await reopenReport(id);
    setActioningId(null);
    if (!res.ok) {
      toast.error(res.data?.error || 'Failed to reopen');
      return;
    }
    toast.message(`Report #${id} reopened`);
    load(status);
  };

  const handleLogout = () => {
    clearModToken();
    setAuthed(false);
    setTokenLocal('');
    setReports([]);
  };

  // ---- Sign-in view ----
  if (!authed) {
    return (
      <div className="min-h-screen bg-[#1e1f22] text-[#f2f3f5] flex items-center justify-center px-6">
        <div className="max-w-md w-full">
          <button
            onClick={() => navigate('/')}
            className="mb-6 inline-flex items-center gap-1.5 text-xs font-mono-ui text-[#949ba4] hover:text-[#f2f3f5] transition-colors"
            data-testid="mod-back-btn"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> back
          </button>

          <div className="rounded-2xl border border-[#1e1f22] bg-[#2b2d31] p-8">
            <div className="w-14 h-14 rounded-xl bg-[#5865f2]/15 flex items-center justify-center mb-6">
              <Shield className="w-7 h-7 text-[#5865f2]" />
            </div>
            <h1 className="font-mono-ui text-3xl font-extrabold tracking-tight" data-testid="mod-signin-title">
              moderator sign-in
            </h1>
            <p className="mt-2 text-sm text-[#b5bac1]">
              Enter your moderator token to review flagged random-stranger sessions.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!token.trim()) return;
                await tryAuth(token.trim());
              }}
              className="mt-6"
            >
              <label className="block font-mono-ui text-[10px] uppercase tracking-[0.25em] text-[#949ba4] mb-2">
                mod token
              </label>
              <input
                data-testid="mod-token-input"
                type="password"
                value={token}
                onChange={(e) => setTokenLocal(e.target.value)}
                placeholder="••••••••"
                autoComplete="off"
                className="w-full bg-[#1e1f22] border border-[#1e1f22] focus:border-[#5865f2] focus:outline-none rounded-lg px-4 py-3 font-mono-ui text-sm text-[#f2f3f5] placeholder:text-[#5c6069] transition-colors"
              />
              <button
                type="submit"
                data-testid="mod-signin-btn"
                disabled={checking || !token.trim()}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white font-mono-ui font-bold text-sm px-5 py-3 rounded-lg transition-colors"
              >
                {checking ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> verifying…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" /> unlock console
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-[10px] font-mono-ui text-[#5c6069] leading-relaxed">
              Set the <span className="text-[#949ba4]">MOD_TOKEN</span> env var on the server. Ask
              the admin for the current value.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Authed console ----
  return (
    <div className="min-h-screen bg-[#1e1f22] text-[#f2f3f5]">
      <header className="border-b border-[#1e1f22] bg-[#2b2d31] px-4 md:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-[#5865f2] flex items-center justify-center">
            <ShieldAlert className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-mono-ui font-extrabold text-sm tracking-tight">
              cs<span className="text-[#23a559]">.</span>chatroom · mod
            </div>
            <div className="font-mono-ui text-[10px] uppercase tracking-[0.25em] text-[#949ba4]">
              stranger reports console
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/chat')}
            className="px-3 py-1.5 rounded-md text-xs font-mono-ui text-[#949ba4] hover:text-white hover:bg-[#404249] transition-colors"
            data-testid="mod-go-chat"
          >
            back to chat
          </button>
          <button
            onClick={handleLogout}
            data-testid="mod-logout-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono-ui font-bold bg-[#4e5058] hover:bg-[#5c5f66] text-white transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> sign out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="total reports" value={stats.total} tone="neutral" />
          <StatCard label="open" value={stats.open} tone="open" />
          <StatCard label="resolved" value={stats.resolved} tone="resolved" />
        </div>

        {/* Filter tabs */}
        <div className="mt-8 flex items-center gap-1 border-b border-[#1e1f22]">
          {[
            { id: 'open', label: 'open' },
            { id: 'resolved', label: 'resolved' },
            { id: 'all', label: 'all' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setStatus(t.id)}
              data-testid={`mod-tab-${t.id}`}
              className={`relative px-4 py-2.5 font-mono-ui text-xs uppercase tracking-[0.2em] font-bold transition-colors ${
                status === t.id
                  ? 'text-[#f2f3f5]'
                  : 'text-[#949ba4] hover:text-[#dbdee1]'
              }`}
            >
              {t.label}
              {status === t.id && (
                <span className="absolute left-3 right-3 -bottom-[1px] h-[2px] bg-[#5865f2] rounded-full" />
              )}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 pr-2">
            <button
              onClick={() => load(status)}
              className="text-xs font-mono-ui text-[#949ba4] hover:text-white px-2 py-1"
              data-testid="mod-refresh-btn"
            >
              refresh
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="mt-4 rounded-lg border border-[#1e1f22] bg-[#2b2d31] overflow-hidden" data-testid="mod-reports-table">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[#949ba4]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> loading…
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-16">
              <Flag className="w-8 h-8 text-[#5c6069] mx-auto mb-3" />
              <div className="font-mono-ui text-lg font-bold">no {status === 'all' ? '' : status} reports</div>
              <div className="text-sm text-[#949ba4] mt-1">
                {status === 'open' ? 'Nothing pending — nice work.' : 'Nothing to show here.'}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#1e1f22]">
              {/* Header row */}
              <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2.5 bg-[#232428] text-[10px] uppercase tracking-[0.2em] font-mono-ui text-[#949ba4] font-bold">
                <div className="col-span-1">#</div>
                <div className="col-span-2">when</div>
                <div className="col-span-3">reported (device)</div>
                <div className="col-span-3">reporter (device)</div>
                <div className="col-span-1">rooms</div>
                <div className="col-span-2 text-right">actions</div>
              </div>

              {reports.map((r) => (
                <div
                  key={r.id}
                  data-testid={`mod-report-row-${r.id}`}
                  className="grid grid-cols-1 md:grid-cols-12 gap-3 px-4 py-3 hover:bg-[#2e3035]/60 items-start md:items-center"
                >
                  <div className="col-span-1 font-mono-ui text-xs text-[#949ba4] tabular-nums">
                    #{r.id}
                  </div>
                  <div className="col-span-2 font-mono-ui text-xs text-[#dbdee1]">
                    {formatFullTime(r.created_at)}
                    {r.resolved && r.resolved_at && (
                      <div className="text-[10px] text-[#23a559] mt-0.5">
                        resolved · {formatFullTime(r.resolved_at)}
                      </div>
                    )}
                  </div>
                  <div className="col-span-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyToClipboard(r.reported_device_id)}
                        className="font-mono-ui text-xs text-[#f2f3f5] hover:text-[#5865f2] transition-colors"
                        title={r.reported_device_id}
                      >
                        {shortId(r.reported_device_id)}
                      </button>
                      <Copy className="w-3 h-3 text-[#5c6069]" />
                    </div>
                    {r.reported_device_report_count > 1 && (
                      <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-mono-ui font-bold text-[#da373c] bg-[#da373c]/10 px-1.5 py-0.5 rounded">
                        <Flag className="w-2.5 h-2.5" />
                        {r.reported_device_report_count} reports on this device
                      </div>
                    )}
                  </div>
                  <div className="col-span-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyToClipboard(r.reporter_device_id)}
                        className="font-mono-ui text-xs text-[#dbdee1] hover:text-[#5865f2] transition-colors"
                        title={r.reporter_device_id}
                      >
                        {shortId(r.reporter_device_id)}
                      </button>
                      <Copy className="w-3 h-3 text-[#5c6069]" />
                    </div>
                  </div>
                  <div className="col-span-1 font-mono-ui text-[10px] text-[#949ba4]">
                    {r.room ? (
                      <span title={r.room}>{r.room.startsWith('stranger-') ? 'stranger' : r.room}</span>
                    ) : (
                      <span className="text-[#5c6069]">—</span>
                    )}
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-1.5">
                    {r.resolved ? (
                      <>
                        <span className="text-[10px] font-mono-ui font-bold text-[#23a559] uppercase tracking-widest">
                          resolved
                        </span>
                        <button
                          onClick={() => handleReopen(r.id)}
                          disabled={actioningId === r.id}
                          data-testid={`mod-reopen-btn-${r.id}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono-ui font-bold text-[#949ba4] hover:text-white hover:bg-[#404249] transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" /> reopen
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleResolve(r.id)}
                        disabled={actioningId === r.id}
                        data-testid={`mod-resolve-btn-${r.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono-ui font-bold bg-[#23a559] hover:bg-[#1a8347] text-white transition-colors disabled:opacity-50"
                      >
                        {actioningId === r.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                        resolve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="mt-6 text-[10px] font-mono-ui text-[#5c6069] leading-relaxed">
          Notes · Stranger sessions are ephemeral, so no message content is retained. Reports carry
          the reporter/reported device IDs, the ephemeral room id, and a timestamp. Repeated reports
          on the same device are highlighted in red.
        </p>
      </main>
    </div>
  );
}

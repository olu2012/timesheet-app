import { useState, useEffect, useCallback } from 'react';
import api from '../../api';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

function getMondayOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function fmtShort(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

function fmtFull(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const STATUS_BADGE = {
  draft:     'bg-gray-100 text-gray-600',
  submitted: 'bg-yellow-100 text-yellow-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
};

function emptyEntries() {
  return Object.fromEntries(DAYS.map((d) => [d, 0]));
}

export default function Timesheet() {
  const [weekStart, setWeekStart] = useState(getMondayOfWeek(new Date()));
  const [timesheet, setTimesheet] = useState(null);
  const [entries, setEntries] = useState(emptyEntries);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState(null); // { type: 'success'|'error', msg }

  const showFlash = (type, msg) => {
    setFlash({ type, msg });
    setTimeout(() => setFlash(null), 4000);
  };

  const loadTimesheet = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/timesheets/my/${weekStart}`);
      setTimesheet(data);
      setNotes(data.notes || '');
      const map = emptyEntries();
      (data.entries || []).forEach((e) => { map[e.day_of_week] = parseFloat(e.hours); });
      setEntries(map);
    } catch (err) {
      showFlash('error', err.response?.data?.error || 'Failed to load timesheet');
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { loadTimesheet(); }, [loadTimesheet]);

  const buildPayload = () => ({
    notes,
    entries: DAYS.map((d) => ({ day_of_week: d, hours: entries[d] ?? 0 })),
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/timesheets/${timesheet.id}`, buildPayload());
      setTimesheet(data);
      showFlash('success', 'Draft saved.');
    } catch (err) {
      showFlash('error', err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Save first, then submit
      await api.put(`/timesheets/${timesheet.id}`, buildPayload());
      const { data } = await api.post(`/timesheets/${timesheet.id}/submit`);
      setTimesheet(data);
      showFlash('success', 'Timesheet submitted for approval!');
    } catch (err) {
      showFlash('error', err.response?.data?.error || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const totalHours = DAYS.reduce((s, d) => s + (parseFloat(entries[d]) || 0), 0);
  const weekEnd = addDays(weekStart, 6);
  const isEditable = timesheet?.status === 'draft' || timesheet?.status === 'rejected';

  return (
    <div>
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">My Timesheet</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 text-gray-600 text-lg font-bold"
          >
            ‹
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-max">
            {fmtShort(weekStart)} — {fmtFull(weekEnd)}
          </span>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 text-gray-600 text-lg font-bold"
          >
            ›
          </button>
          <button
            onClick={() => setWeekStart(getMondayOfWeek(new Date()))}
            className="ml-1 text-xs text-indigo-600 hover:underline"
          >
            Today
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          {/* Status + total */}
          <div className="flex items-center justify-between mb-5">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide ${STATUS_BADGE[timesheet?.status]}`}>
              {timesheet?.status}
            </span>
            <span className="text-sm text-gray-500">
              Total: <span className="text-indigo-600 font-bold text-base">{totalHours.toFixed(1)} hrs</span>
            </span>
          </div>

          {/* Rejection note */}
          {timesheet?.status === 'rejected' && timesheet?.admin_note && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5 text-sm text-red-700">
              <strong>Admin note:</strong> {timesheet.admin_note}
            </div>
          )}

          {/* Day rows */}
          <div className="space-y-3 mb-5">
            {DAYS.map((day, i) => {
              const date = addDays(weekStart, i);
              const isWeekend = day === 'sat' || day === 'sun';
              return (
                <div key={day} className={`flex items-center gap-3 ${isWeekend ? 'opacity-60' : ''}`}>
                  <div className="w-24 text-sm font-medium text-gray-700">{DAY_LABELS[day]}</div>
                  <div className="text-xs text-gray-400 w-20">{fmtShort(date)}</div>
                  <input
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    value={entries[day] ?? 0}
                    disabled={!isEditable}
                    onChange={(e) =>
                      setEntries((prev) => ({ ...prev, [day]: parseFloat(e.target.value) || 0 }))
                    }
                    className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center
                               disabled:bg-gray-50 disabled:text-gray-400
                               focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <span className="text-xs text-gray-400">hrs</span>
                </div>
              );
            })}
          </div>

          {/* Notes */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              disabled={!isEditable}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any notes about this week…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                         disabled:bg-gray-50 disabled:text-gray-400
                         focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Flash message */}
          {flash && (
            <div className={`text-sm mb-4 px-4 py-2 rounded-lg ${
              flash.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {flash.msg}
            </div>
          )}

          {/* Action buttons */}
          {isEditable && (
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving || submitting}
                className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Draft'}
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || submitting}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit for Approval'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

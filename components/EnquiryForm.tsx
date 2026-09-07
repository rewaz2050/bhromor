'use client';

import { useState } from 'react';
import { retreats, site } from '@/lib/content';

type Status = 'idle' | 'sending' | 'sent';

/**
 * Enquiry form. There is no backend in this build, so a completed form
 * hands off to the guest's own mail client with everything pre-filled.
 * Swap handleSubmit for a POST to your form endpoint when one exists.
 */
export default function EnquiryForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [form, setForm] = useState({
    name: '',
    email: '',
    retreat: retreats[0].name,
    month: '',
    guests: '2',
    notes: '',
  });

  const update = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('sending');

    const subject = `Enquiry — ${form.retreat} (${form.month || 'flexible'})`;
    const body = [
      `Name: ${form.name}`,
      `Email: ${form.email}`,
      `Retreat: ${form.retreat}`,
      `Preferred month: ${form.month || 'Flexible'}`,
      `Guests: ${form.guests}`,
      '',
      'Notes:',
      form.notes || '—',
    ].join('\n');

    const href = `mailto:${site.email}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;

    window.location.href = href;
    setStatus('sent');
  };

  const field =
    'w-full rounded-sm border border-ink/15 bg-ivory-pale px-4 py-3.5 font-sans text-sm font-light text-ink outline-none transition-colors duration-300 placeholder:text-ink/35 focus:border-moss-600';
  const label =
    'mb-2.5 block font-sans text-[0.6875rem] font-medium uppercase tracking-widest2 text-moss-600';

  return (
    <form onSubmit={handleSubmit} className="space-y-7">
      <div className="grid gap-7 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className={label}>
            Your name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
            placeholder="Nafisa Rahman"
            value={form.name}
            onChange={update('name')}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="email" className={label}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={update('email')}
            className={field}
          />
        </div>
      </div>

      <div className="grid gap-7 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <label htmlFor="retreat" className={label}>
            Retreat
          </label>
          <select
            id="retreat"
            name="retreat"
            value={form.retreat}
            onChange={update('retreat')}
            className={field}
          >
            {retreats.map((r) => (
              <option key={r.slug} value={r.name}>
                {r.name}
              </option>
            ))}
            <option value="Not sure yet">Not sure yet</option>
          </select>
        </div>
        <div>
          <label htmlFor="month" className={label}>
            Preferred month
          </label>
          <input
            id="month"
            name="month"
            type="month"
            value={form.month}
            onChange={update('month')}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="guests" className={label}>
            Guests
          </label>
          <select
            id="guests"
            name="guests"
            value={form.guests}
            onChange={update('guests')}
            className={field}
          >
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Whole house'].map(
              (n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ),
            )}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="notes" className={label}>
          Anything we should know
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={5}
          placeholder="Dietary needs, access requirements, what you are hoping to get out of the week."
          value={form.notes}
          onChange={update('notes')}
          className={`${field} resize-y`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <button
          type="submit"
          disabled={status === 'sending'}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'sent' ? 'Opening your mail app…' : 'Send enquiry'}
        </button>
        <p className="max-w-xs font-sans text-xs font-light leading-relaxed text-ink/45">
          We reply to everything within two days, usually one. No deposit is
          taken until dates are confirmed.
        </p>
      </div>

      {status === 'sent' && (
        <p className="rounded-sm border border-moss-200 bg-moss-50 px-5 py-4 font-sans text-sm font-light text-moss-800">
          Your mail app should have opened with the enquiry ready to send. If it
          did not, write to us directly at{' '}
          <a href={`mailto:${site.email}`} className="link-underline">
            {site.email}
          </a>
          .
        </p>
      )}
    </form>
  );
}

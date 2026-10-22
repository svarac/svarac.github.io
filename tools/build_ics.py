#!/usr/bin/env python3
"""Write one calendar file per episode, cal/svarac-<no>.ics, from data.json.

iPhone Safari only offers "add to calendar" for a real .ics file served by the site,
so the "iPhoneなどのカレンダーに追加" button links to these files.
After editing data.json, run from the top of the repository:

    python3 tools/build_ics.py
"""
import datetime
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = 'https://svarac.github.io/'
UTC = datetime.timezone.utc


def text(value):
    """Escape a TEXT value (RFC 5545 3.3.11)."""
    return value.replace('\\', '\\\\').replace(';', '\\;').replace(',', '\\,').replace('\n', '\\n')


def fold(line):
    """Fold a content line at 75 octets without splitting a character (RFC 5545 3.1)."""
    parts, cur = [], b''
    for ch in line:
        b = ch.encode('utf-8')
        limit = 75 if not parts else 74  # continuation lines begin with a space
        if len(cur) + len(b) > limit:
            parts.append(cur)
            cur = b
        else:
            cur += b
    parts.append(cur)
    return b'\r\n '.join(parts)


def stamp(dt):
    return dt.astimezone(UTC).strftime('%Y%m%dT%H%M%SZ')


def main():
    data = json.loads((ROOT / 'data.json').read_text(encoding='utf-8'))
    duration = datetime.timedelta(minutes=data.get('defaultDurationMinutes') or 90)
    out_dir = ROOT / 'cal'
    out_dir.mkdir(exist_ok=True)
    keep = set()
    now = datetime.datetime.now(UTC)
    for ep in data.get('episodes', []):
        if not ep.get('start') or not ep.get('no'):
            continue
        start = datetime.datetime.fromisoformat(ep['start'])
        end = datetime.datetime.fromisoformat(ep['end']) if ep.get('end') else start + duration
        title = ep.get('calendarTitle') or data.get('calendarTitle') or 'SVARAC（スバラシー）'
        guests = ep.get('guests') or []
        who = ('ゲスト：' + '、'.join(g['name'] for g in guests)) if guests else (('ゲスト：' + ep['guestNote']) if ep.get('guestNote') else '')
        details = '\n'.join(x for x in [ep.get('preview', ''), who, 'Spoonで配信', SITE] if x)
        lines = [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SVARAC//LP//JA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            f"UID:svarac-{ep['no']}@svarac.github.io",
            f'DTSTAMP:{stamp(now)}',
            f'DTSTART:{stamp(start)}',
            f'DTEND:{stamp(end)}',
            f'SUMMARY:{text(title)}',
            f'DESCRIPTION:{text(details)}',
            f'URL:{SITE}',
            'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT30M', f'DESCRIPTION:{text(title)}', 'END:VALARM',
            'END:VEVENT', 'END:VCALENDAR',
        ]
        name = f"svarac-{ep['no']}.ics"
        (out_dir / name).write_bytes(b'\r\n'.join(fold(l) for l in lines) + b'\r\n')
        keep.add(name)
        print('wrote', 'cal/' + name, '|', title, '|', start.isoformat(), '→', end.isoformat())
    for old in out_dir.glob('*.ics'):
        if old.name not in keep:
            old.unlink()
            print('removed', 'cal/' + old.name)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Conservative election-day ingestion of OFFICIAL K26 data into static JSON.

Source: official mapvotes.bechirot.gov.il daytime turnout map and official
media26.bechirot.gov.il/files/expc.csv count file. No synthetic data.
Fails closed on test/pre-election/stale data; never overwrites valid snapshots.

If map assets cannot be discovered, configure TURNOUT_FEED_URL to the verified
public map data resource. Never use a test or third-party data endpoint.
"""
import csv
import io
import json
import os
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DAY = '2026-10-27'
ISRAEL = ZoneInfo('Asia/Jerusalem')
MAP_ORIGIN = 'https://mapvotes.bechirot.gov.il/'
RESULTS_URL = 'https://media26.bechirot.gov.il/files/expc.csv'
TURNOUT_ALIASES = {
 'code': ['סמל ישוב','סמל יישוב','סמל_ישוב','cityCode','cityID','settlementCode','settlement_code','yishuv_code','code'],
 'ballot': ['קלפי','מספר קלפי','ballot','ballotNumber','stationNumber','kalpi'],
 'eligible': ['בזב','בז"ב','eligible','eligibleVoters','electors','numEligible','totalEligible','בוחרים'],
 'voters': ['מצביעים','מספר מצביעים','voters','voted','votersCount','numVoters','actualVoters','cast'],
 'pct': ['אחוז הצבעה','אחוז_הצבעה','turnout','turnoutPct','votingPercentage','percentage']
}

def time_of(value):
    if not value:return None
    try:
        if isinstance(value,(int,float)):return datetime.fromtimestamp(value/1000 if value>1e11 else value,tz=timezone.utc)
        if isinstance(value,str):
            if value.endswith('Z'):value=value[:-1]+'+00:00'
            dt=datetime.fromisoformat(value)
            return dt if dt.tzinfo else None
    except (ValueError, OverflowError, OSError):return None
    return None

def header_time(headers):
    try:return parsedate_to_datetime(headers.get('last-modified',''))
    except (ValueError,TypeError,IndexError):return None

def validated_time(values, minimum_hour):
    # Use SOURCE update timestamp, not the time the action downloaded the file.
    for dt in values:
        if not dt:continue
        dt=dt.astimezone(ISRAEL)
        if dt.strftime('%Y-%m-%d')==DAY and dt.hour>=minimum_hour and dt<=datetime.now(ISRAEL):
            return dt.isoformat(timespec='seconds')
    raise ValueError('No genuine K26 election-day source timestamp (rejecting stale/test data)')

def allowed(url):
    parts=urlsplit(url)
    return parts.scheme=='https' and parts.hostname in {'mapvotes.bechirot.gov.il','media26.bechirot.gov.il'} and not parts.username

def download(url,maxsize=18000000):
    if not allowed(url):raise ValueError('Source not on official production host')
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 election-turnout/1.0','Cache-Control':'no-cache'})
    with urllib.request.urlopen(req,timeout=24) as resp:
        data=resp.read(maxsize+1)
        if len(data)>maxsize:raise ValueError('Feed too large')
        return data,resp.headers

def text_of(blob):
    for codec in ('utf-8-sig','cp1255'):
        try:return blob.decode(codec)
        except UnicodeDecodeError:pass
    raise ValueError('Unsupported feed encoding')

def records(obj):
    if isinstance(obj,list):rows=obj
    elif isinstance(obj,dict):
        if isinstance(obj.get('columns'),list) and isinstance(obj.get('rows'),list):
            return [dict(zip(obj['columns'],r)) for r in obj['rows'] if isinstance(r,list)]
        rows=next((obj[k] for k in ('features','rows','records','data','stations','items','results') if k in obj),obj)
    else:return []
    if isinstance(rows,dict):
        rows=[dict(v,code=k) for k,v in rows.items() if isinstance(v,dict)]
    if not isinstance(rows,list):return []
    return [r.get('properties',r.get('attributes',r)) for r in rows if isinstance(r,dict)]

def field(r,key):
    for alias in TURNOUT_ALIASES[key]:
        if alias in r and r[alias] not in (None,''):return r[alias]
    return None

def integer(v):
    if v is None:return None
    try:
        raw=str(v).replace(',','').replace('%','').strip()
        n=float(raw)
        return int(round(n)) if n>=0 and n<1e8 else None
    except (TypeError,ValueError):return None

def parse_turnout(raw):
    value=json.loads(text_of(raw))
    if isinstance(value,dict) and (value.get('test') or value.get('mock') or value.get('environment') in ('test','demo')):
        raise ValueError('Test feed rejected')
    stations=defaultdict(lambda:[0,0]);towns={}
    for r in records(value):
        code=integer(field(r,'code'))
        if not code or code>=9999:continue
        elig=integer(field(r,'eligible'))
        voters=integer(field(r,'voters'))
        pct=field(r,'pct')
        if elig and voters is None and pct is not None:
            try:voters=round(elig*float(str(pct).replace('%','').replace(',','.'))/100)
            except ValueError:pass
        if not elig or voters is None or voters>elig or voters<0:continue
        ballot=field(r,'ballot')
        if ballot not in (None,''):
            stations[code][0]+=elig;stations[code][1]+=voters
        elif code not in towns:towns[code]=[elig,voters]
    # Never double count city summaries alongside station rows.
    result=[{'code':str(k),'eligible':v[0],'voters':v[1]} for k,v in {**towns,**stations}.items() if v[0]>0]
    if len(result)<30 or sum(r['eligible'] for r in result)<100000:
        raise ValueError('Turnout feed too sparse to distinguish from a test fixture')
    dt=next((time_of(value.get(k)) for k in ('as_of','asOf','generated','updated_at','timestamp','lastUpdated') if isinstance(value,dict) and time_of(value.get(k))),None)
    return result,dt

def parse_count(raw):
    content=text_of(raw)
    if content.lstrip().startswith('<'):raise ValueError('HTML login/test page, not CSV')
    rows=list(csv.DictReader(io.StringIO(content)))
    if not rows:raise ValueError('No count rows')
    meta={'סמל ישוב','סמל יישוב','שם ישוב','שם יישוב','בזב','מצביעים','כשרים','פסולים','סמל ועדה','קלפי','ברזל','ריכוז','שופט'}
    out=[]
    for r in rows:
        code=integer(r.get('סמל ישוב',r.get('סמל יישוב')))
        if not code or code>=9999:continue
        parties={k:integer(v) for k,v in r.items() if k and k.strip() not in meta and k.strip() and integer(v)}
        if not parties:continue
        out.append({'code':str(code),'parties':parties})
    if len(out)<30 or sum(sum(r['parties'].values()) for r in out)<10000:
        raise ValueError('Count file too sparse; potential test fixture')
    if len(set(r['code'] for r in out))!=len(out):raise ValueError('Duplicate locality in count file')
    return out

def discover_map():
    candidates=[]
    env=os.environ.get('TURNOUT_FEED_URL','').strip()
    if env:
        if not allowed(env):raise ValueError('TURNOUT_FEED_URL must be official mapvotes host')
        return [env]
    try:
        blob,_=download(urljoin(MAP_ORIGIN,'data/votes/elections.json'))
        cat=json.loads(text_of(blob))
        for entry in (cat.get('elections') or {}).values():
            if not isinstance(entry,dict):continue
            p=entry.get('path','')
            if not p:continue
            for section in ('kalpi','municipal','neighborhood'):
                candidates.append(urljoin(MAP_ORIGIN,f'data/votes/{p}/{section}_data.json'))
    except Exception as exc:print('Catalog:',exc,file=sys.stderr)
    try:
        html,_=download(MAP_ORIGIN)
        source=text_of(html)
        assets=re.findall(r'''(?:src|href)=["']([^"']+\.js(?:\?[^"']*)?)["']''',source)
        for path in assets[:12]:
            try:
                js,_=download(urljoin(MAP_ORIGIN,path),maxsize=6000000)
                for u in re.findall(r'''["']([^"']+\.json(?:\?[^"']*)?)["']''',text_of(js)):
                    candidates.append(urljoin(MAP_ORIGIN,u))
            except Exception:continue
    except Exception as exc:print('Map page:',exc,file=sys.stderr)
    # Catalog candidate is attempted first, even if discovery fails.
    return list(dict.fromkeys(candidates))[:35]

def store(kind,rows,stamp,source):
    out=ROOT/'data'/f'{kind}.json'
    content={'type':kind,'timestamp':stamp,'source':source,'environment':'production','localities':sorted(rows,key=lambda r:int(r['code']))}
    serialized=json.dumps(content,ensure_ascii=False,separators=(',',':'))+'\n'
    if out.exists() and out.read_text(encoding='utf-8')==serialized:return False
    out.parent.mkdir(exist_ok=True)
    out.write_text(serialized,encoding='utf-8')
    return True

def run():
    succeeded=[]
    for url in discover_map():
        try:
            blob,headers=download(url)
            rows,metadata=parse_turnout(blob)
            stamp=validated_time([metadata,header_time(headers)],minimum_hour=7)
            store('turnout',rows,stamp,url)
            succeeded.append(f'turnout {len(rows)} cities {stamp} ({url})')
            break
        except Exception as exc:print(f'Turnout candidate rejected {url}: {exc}',file=sys.stderr)
    try:
        blob,headers=download(RESULTS_URL)
        rows=parse_count(blob)
        stamp=validated_time([header_time(headers)],minimum_hour=22)
        store('count',rows,stamp,RESULTS_URL)
        succeeded.append(f'count {len(rows)} cities {stamp}')
    except Exception as exc:print(f'Count feed not ready: {exc}',file=sys.stderr)
    if not succeeded:
        print('No new VERIFIED election-day data. Retained previous files.');return 0
    print('\n'.join(succeeded));return 0

if __name__=='__main__':sys.exit(run())
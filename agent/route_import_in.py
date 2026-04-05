"""
route_import_in.py  —  Sales Invoice (IN) import for Express Accounting BIT9
Blueprint: import_in_bp   Route: POST /import-in

DBF files written:
  ARTRN.DBF    — invoice header
  STCRD.DBF    — line items (ARTRNIT does not exist in this version)
  GLJNL.DBF    — GL journal header
  GLJNLIT.DBF  — GL journal lines

Usage in agent.py:
    from route_import_in import import_in_bp
    app.register_blueprint(import_in_bp)
"""

import os, struct, logging
from datetime import datetime, date
from collections import defaultdict
from flask import Blueprint, request, jsonify, current_app
import pandas as pd

logger = logging.getLogger(__name__)
import_in_bp = Blueprint('import_in', __name__)

ENCODING = 'cp874'
USERID   = 'BIT9'

# ─────────────────────────────────────────────
#  DBF low-level helpers
# ─────────────────────────────────────────────

def _encode_field(value, ftype, flen, fdec=0):
    """Encode a Python value → bytes for one DBF field."""
    if ftype == 'C':
        s = str(value or '').encode(ENCODING, errors='replace')
        return s[:flen].ljust(flen, b' ')

    elif ftype == 'N':
        try:
            num = float(value or 0)
        except (TypeError, ValueError):
            num = 0.0
        if fdec:
            s = f"{num:{flen}.{fdec}f}"
        else:
            s = f"{int(round(num)):d}"
        return s[-flen:].rjust(flen).encode('ascii')

    elif ftype == 'B':
        # FoxPro double (8-byte little-endian IEEE 754)
        try:
            num = float(value or 0)
        except (TypeError, ValueError):
            num = 0.0
        return struct.pack('<d', num)

    elif ftype == 'D':
        if value is None:
            return b'        '
        if isinstance(value, datetime):
            value = value.date()
        if isinstance(value, date):
            return f"{value.year:04d}{value.month:02d}{value.day:02d}".encode('ascii')
        s = str(value or '').strip()
        if len(s) == 8 and s.isdigit():
            return s.encode('ascii')
        return b'        '

    elif ftype == 'L':
        return b'T' if value in (True, 'T', 'Y', 't', 'y', 1) else b'F'

    else:
        return b' ' * flen


def _read_dbf_meta(filepath):
    """Read DBF header → (fields, header_size, record_size, num_records)."""
    with open(filepath, 'rb') as f:
        hdr = f.read(32)
        num_recs   = struct.unpack('<I', hdr[4:8])[0]
        hdr_size   = struct.unpack('<H', hdr[8:10])[0]
        rec_size   = struct.unpack('<H', hdr[10:12])[0]
        fields = []
        while True:
            fd = f.read(32)
            if not fd or fd[0] == 0x0D:
                break
            name  = fd[:11].split(b'\x00')[0].decode('ascii').strip()
            ftype = chr(fd[11])
            flen  = fd[16]
            fdec  = fd[17]
            fields.append((name, ftype, flen, fdec))
    return fields, hdr_size, rec_size, num_recs


def _get_record_count(filepath):
    with open(filepath, 'rb') as f:
        return struct.unpack('<I', f.read(8)[4:8])[0]


def _set_record_count(filepath, count):
    with open(filepath, 'r+b') as f:
        f.seek(4)
        f.write(struct.pack('<I', count))


def _append_record(filepath, fields, values):
    """Append one record to a DBF file."""
    row = b' '  # deletion flag
    for name, ftype, flen, fdec in fields:
        val = values.get(name)
        row += _encode_field(val, ftype, flen, fdec)

    with open(filepath, 'r+b') as f:
        f.seek(-1, 2)
        last = f.read(1)
        if last == b'\x1a':
            f.seek(-1, 2)
        else:
            f.seek(0, 2)
        f.write(row)
        f.write(b'\x1a')

    _set_record_count(filepath, _get_record_count(filepath) + 1)


# ─────────────────────────────────────────────
#  Date helpers
# ─────────────────────────────────────────────

def _parse_thai_date(val):
    """DD/MM/YYYY (พ.ศ.) → date (ค.ศ.)  |  also handles datetime / date objects."""
    if val is None or str(val).strip() in ('', 'nan', 'None'):
        return None
    if isinstance(val, datetime):
        d = val.date()
        return date(d.year - 543, d.month, d.day) if d.year > 2400 else d
    if isinstance(val, date):
        return date(val.year - 543, val.month, val.day) if val.year > 2400 else val
    s = str(val).strip()
    for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y'):
        try:
            dt = datetime.strptime(s, fmt)
            yr = dt.year - 543 if dt.year > 2400 else dt.year
            return date(yr, dt.month, dt.day)
        except ValueError:
            pass
    return None


# ─────────────────────────────────────────────
#  Auto-numbering
# ─────────────────────────────────────────────

def _next_docnum(dbf_path, prefix='IN'):
    fp = os.path.join(dbf_path, 'ARTRN.DBF')
    max_n = 0
    if os.path.exists(fp):
        try:
            from dbfread import DBF
            for r in DBF(fp, encoding=ENCODING, ignore_missing_memofile=True):
                v = (r.get('DOCNUM') or '').strip()
                if v.upper().startswith(prefix.upper()):
                    try:
                        n = int(v[len(prefix):])
                        max_n = max(max_n, n)
                    except ValueError:
                        pass
        except Exception as e:
            logger.warning(f'next_docnum: {e}')
    # format: IN + YY(พ.ศ. 2 หลัก) + running 5 digits  e.g. IN6800001
    from datetime import date as _d
    yy = str(_d.today().year + 543)[2:]
    return f"{prefix}{yy}{max_n + 1:05d}"


# ─────────────────────────────────────────────
#  Core writer
# ─────────────────────────────────────────────

def _write_invoice(dbf_path, hdr, items,
                   artrn_fields, stcrd_fields, gljnl_fields, gljnlit_fields):
    """Write one complete invoice to all DBF files."""
    docnum  = hdr['DOCNUM']
    docdat  = hdr['DOCDAT_OBJ']   # date object (ค.ศ.)
    flgvat  = hdr.get('FLGVAT', '2')   # '2' = แยก VAT
    vatrat  = float(hdr.get('VATRAT', 7))
    advamt  = float(hdr.get('ADVAMT', 0) or 0)
    advnum  = hdr.get('ADVNUM', '')    # e.g. 'AI'
    discpct = hdr.get('DISC', '')      # header discount % string e.g. '0'

    today   = date.today()

    # ── คำนวณยอดรายการ ──
    total_trnval  = 0.0
    total_discamt = 0.0
    processed_items = []

    for seq, item in enumerate(items, start=1):
        qty     = float(item.get('TRNQTY', 1)  or 1)
        unitpr  = float(item.get('UNITPR', 0)  or 0)
        tfactor = float(item.get('TFACTOR', 1) or 1)
        disc_c  = str(item.get('DISC', '') or '')
        # DISC เป็น C field ใน STCRD เก็บเป็น string เช่น '10' = 10%
        try:
            disc_pct = float(disc_c)
        except (ValueError, TypeError):
            disc_pct = 0.0

        trnval  = round(qty * unitpr * tfactor, 2)
        discamt_item = round(trnval * disc_pct / 100, 2)
        netval  = round(trnval - discamt_item, 2)

        total_trnval  += trnval
        total_discamt += discamt_item

        seqnum = str(item.get('SEQNUM', '') or seq).rjust(3)   # C,3

        processed_items.append({
            **item,
            'DOCNUM':   docnum,
            'SEQNUM':   seqnum,
            'DOCDAT':   docdat,
            'PEOPLE':   hdr.get('CUSCOD', ''),
            'TRNQTY':   qty,
            'TFACTOR':  tfactor,
            'UNITPR':   unitpr,
            'DISCAMT':  discamt_item,
            'TRNVAL':   trnval,
            'XTRNQTY':  qty,
            'XUNITPR':  unitpr,
            'XTRNVAL':  trnval,
            'XSALVAL':  netval,
            'NETVAL':   netval,
            'POSOPR':   '9',
            'PHYBAL':   0.0,
            'MREMBAL':  0.0,
            'MREMVAL':  0.0,
            'BALCHG':   0.0,
            'VALCHG':   0.0,
            'LOTBAL':   0.0,
            'LOTVAL':   0.0,
            'LUNITPR':  0.0,
        })

    # ── ยอดรวม header ──
    total_trnval  = round(total_trnval,  2)
    total_discamt = round(total_discamt, 2)
    aftdisc       = round(total_trnval - total_discamt, 2)
    total_before_vat = round(aftdisc - advamt, 2)

    if flgvat == '1':  # รวม VAT
        vatamt   = round(total_before_vat * vatrat / (100 + vatrat), 2)
        netamt   = total_before_vat
    else:              # แยก VAT (default '2')
        vatamt   = round(total_before_vat * vatrat / 100, 2)
        netamt   = round(total_before_vat + vatamt, 2)

    netval  = netamt
    remamt  = netamt   # ยังไม่ได้รับชำระ

    # ── เขียน ARTRN ──
    artrn_rec = {
        'RECTYP':     '3',
        'DOCNUM':     docnum,
        'DOCDAT':     docdat,
        'POSTGL':     'Y',
        'SONUM':      hdr.get('SONUM', ''),
        'DEPCOD':     hdr.get('DEPCOD', ''),
        'FLGVAT':     flgvat,
        'SLMCOD':     hdr.get('SLMCOD', ''),
        'CUSCOD':     hdr.get('CUSCOD', ''),
        'SHIPTO':     hdr.get('SHIPTO', ''),
        'YOUREF':     hdr.get('YOUREF', ''),
        'PAYTRM':     int(hdr.get('PAYTRM', 0) or 0),
        'DUEDAT':     hdr.get('DUEDAT_OBJ'),
        'DISC':       str(discpct),
        'AMOUNT':     total_trnval,
        'DISCAMT':    total_discamt,
        'AFTDISC':    aftdisc,
        'ADVNUM':     advnum,
        'ADVAMT':     advamt,
        'TOTAL':      total_before_vat,
        'AMTRAT0':    0.0,
        'VATRAT':     vatrat,
        'VATAMT':     vatamt,
        'NETAMT':     netamt,
        'NETVAL':     netval,
        'RCVAMT':     0.0,
        'REMAMT':     remamt,
        'COMAMT':     0.0,
        'CMPLAPP':    'N',
        'DOCSTAT':    'N',
        'CSHRCV':     0.0,
        'CHQRCV':     0.0,
        'INTRCV':     0.0,
        'BEFTAX':     0.0,
        'TAXRAT':     0.0,
        'TAX':        0.0,
        'IVCAMT':     0.0,
        'CHQPAS':     0.0,
        'SRV_VATTYP': flgvat,
        'DLVBY':      hdr.get('DLVBY', ''),
        'USERID':     USERID,
        'CHGDAT':     today,
        'BILLTO':     hdr.get('BILLTO', ''),
        'ORGNUM':     0,
        'PRNCNT':     0,
    }
    _append_record(os.path.join(dbf_path, 'ARTRN.DBF'), artrn_fields, artrn_rec)
    logger.info(f'  ✓ ARTRN  {docnum}')

    # ── เขียน STCRD (รายการสินค้า) ──
    stcrd_path = os.path.join(dbf_path, 'STCRD.DBF')
    for item_rec in processed_items:
        _append_record(stcrd_path, stcrd_fields, item_rec)
    logger.info(f'  ✓ STCRD  {len(processed_items)} rows')

    # ── เขียน GLJNL ──
    gljnl_rec = {
        'JNLTYP':  '03',
        'VOUDAT':  docdat,
        'VOUCHER': docnum,
        'REFNUM':  hdr.get('YOUREF', ''),
        'SRCJNL':  'AR',
        'DESCRP':  f"ขายสินค้า/บริการ {hdr.get('CUSCOD','')}",
        'TRNSTAT': 'P',
        'DOCSTAT': 'C',
        'CREBY':   USERID,
        'CREDAT':  today,
        'USERID':  USERID,
        'CHGDAT':  today,
        'PRNCNT':  0,
    }
    _append_record(os.path.join(dbf_path, 'GLJNL.DBF'), gljnl_fields, gljnl_rec)
    logger.info(f'  ✓ GLJNL  {docnum}')

    # ── เขียน GLJNLIT ──
    # บัญชี AR (Dr) / Revenue (Cr) / VAT Output (Cr)
    AR_ACCOUNT  = hdr.get('ACCNUM_AR',  '1130-01')   # ลูกหนี้การค้า
    VAT_ACCOUNT = hdr.get('ACCNUM_VAT', '2210-00')   # ภาษีขาย
    descrp_gl   = f"ขายสินค้า/บริการ {hdr.get('CUSCOD','')}"
    gljnlit_path = os.path.join(dbf_path, 'GLJNLIT.DBF')

    gl_seq = 1

    # Dr: ลูกหนี้การค้า
    _append_record(gljnlit_path, gljnlit_fields, {
        'VOUCHER': docnum,
        'SEQIT':   str(gl_seq).rjust(2),
        'VOUDAT':  docdat,
        'ACCNUM':  AR_ACCOUNT,
        'DESCRP':  descrp_gl,
        'TRNTYP':  '0',   # Dr
        'AMOUNT':  netamt,
        'CHGDAT':  today,
    })
    gl_seq += 1

    # Cr: รายได้ (แยกตาม ACCNUMCR ของแต่ละรายการ)
    rev_by_acc = defaultdict(float)
    for item_rec in processed_items:
        acc = (item_rec.get('ACCNUMCR') or '4100-00').strip()
        rev_by_acc[acc] += item_rec['NETVAL']

    for acc, amt in rev_by_acc.items():
        _append_record(gljnlit_path, gljnlit_fields, {
            'VOUCHER': docnum,
            'SEQIT':   str(gl_seq).rjust(2),
            'VOUDAT':  docdat,
            'ACCNUM':  acc,
            'DESCRP':  descrp_gl,
            'TRNTYP':  '1',   # Cr
            'AMOUNT':  round(amt, 2),
            'CHGDAT':  today,
        })
        gl_seq += 1

    # Cr: ภาษีขาย
    if vatamt > 0:
        _append_record(gljnlit_path, gljnlit_fields, {
            'VOUCHER': docnum,
            'SEQIT':   str(gl_seq).rjust(2),
            'VOUDAT':  docdat,
            'ACCNUM':  VAT_ACCOUNT,
            'DESCRP':  f"VAT {vatrat}% {docnum}",
            'TRNTYP':  '1',   # Cr
            'AMOUNT':  vatamt,
            'CHGDAT':  today,
        })

    logger.info(f'  ✓ GLJNLIT Dr AR + Cr Revenue + Cr VAT')

    return {
        'docnum':  docnum,
        'cuscod':  hdr.get('CUSCOD', ''),
        'netamt':  round(netamt, 2),
        'vatamt':  round(vatamt, 2),
        'total':   round(netamt, 2),
        'items':   len(processed_items),
    }


# ─────────────────────────────────────────────
#  Flask route
# ─────────────────────────────────────────────

@import_in_bp.route('/import-in', methods=['POST'])
def import_in():
    """
    POST /import-in
    multipart/form-data:
      file      — Excel file (.xlsx)
      dbf_path  — path to DBF folder (optional, fallback to app config DBF_PATH)
    """
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'ไม่พบ key "file"'}), 400

    xl_file  = request.files['file']
    dbf_path = (request.form.get('dbf_path', '') or
                current_app.config.get('DBF_PATH', r'Z:\Aulgor')).strip()

    if not os.path.isdir(dbf_path):
        return jsonify({'success': False, 'error': f'ไม่พบโฟลเดอร์: {dbf_path}'}), 400

    required_files = ['ARTRN.DBF', 'STCRD.DBF', 'GLJNL.DBF', 'GLJNLIT.DBF']
    missing = [fn for fn in required_files
               if not os.path.exists(os.path.join(dbf_path, fn))]
    if missing:
        return jsonify({'success': False, 'error': f'ไม่พบ DBF: {missing}'}), 400

    # อ่าน Excel (row 3 = header ตาม template)
    try:
        df = pd.read_excel(xl_file, sheet_name=0, header=2, dtype=str)
        df = df.dropna(how='all')
        df.columns = [str(c).strip() for c in df.columns]
    except Exception as e:
        return jsonify({'success': False, 'error': f'อ่าน Excel ไม่ได้: {e}'}), 400

    required_cols = {'INVDT', 'CUSCOD', 'STKCOD', 'TRNQTY', 'UNITPR'}
    missing_cols  = required_cols - set(df.columns)
    if missing_cols:
        return jsonify({'success': False,
                        'error': f'Excel ขาด column: {missing_cols}'}), 400

    # อ่าน DBF fields
    try:
        artrn_fields,  *_ = _read_dbf_meta(os.path.join(dbf_path, 'ARTRN.DBF'))
        stcrd_fields,  *_ = _read_dbf_meta(os.path.join(dbf_path, 'STCRD.DBF'))
        gljnl_fields,  *_ = _read_dbf_meta(os.path.join(dbf_path, 'GLJNL.DBF'))
        gljnlit_fields,*_ = _read_dbf_meta(os.path.join(dbf_path, 'GLJNLIT.DBF'))
    except Exception as e:
        return jsonify({'success': False, 'error': f'อ่าน DBF fields ไม่ได้: {e}'}), 500

    # จัดกลุ่มแถวตาม INVNO (ถ้า INVNO ว่างถือว่าเป็น Invoice เดิมกับแถวก่อนหน้า)
    groups   = {}
    order    = []
    cur_key  = None

    for _, row in df.iterrows():
        invno_raw = str(row.get('INVNO', '') or '').strip()
        invno_raw = '' if invno_raw in ('nan', 'None') else invno_raw
        cuscod    = str(row.get('CUSCOD', '') or '').strip()
        invdt_raw = str(row.get('INVDT', '') or '').strip()

        # แถวที่มี INVNO หรือ CUSCOD = เริ่ม Invoice ใหม่
        if invno_raw or cuscod:
            cur_key = invno_raw or f'__auto_{len(groups)}'
            if cur_key not in groups:
                order.append(cur_key)
                groups[cur_key] = {
                    'header': {
                        'DOCNUM':    invno_raw,
                        'INVDT':     invdt_raw,
                        'CUSCOD':    cuscod,
                        'YOUREF':    str(row.get('YOUREF', '') or '').strip(),
                        'SONUM':     str(row.get('SONUM',  '') or '').strip(),
                        'PAYTRM':    str(row.get('PAYTRM', '0') or '0').strip(),
                        'DUEDT':     str(row.get('DUEDT',  '') or '').strip(),
                        'FLGVAT':    str(row.get('FLGVAT', '2') or '2').strip(),
                        'VATRAT':    str(row.get('VATRAT', '7') or '7').strip(),
                        'DEPCOD':    str(row.get('DEPCOD', '') or '').strip(),
                        'SLMCOD':    str(row.get('SLMCOD', '') or '').strip(),
                        'BILLTO':    str(row.get('BILLTO', '') or '').strip(),
                        'DLVBY':     str(row.get('DLVBY',  '') or '').strip(),
                        'ADVNUM':    str(row.get('ADVNUM', '') or '').strip(),
                        'ADVAMT':    str(row.get('ADVAMT', '0') or '0').strip(),
                        'DISC':      str(row.get('DISC',   '0') or '0').strip(),
                        'ACCNUM_AR': str(row.get('ACCNUM_AR',  '1130-01') or '1130-01').strip(),
                        'ACCNUM_VAT':str(row.get('ACCNUM_VAT', '2210-00') or '2210-00').strip(),
                    },
                    'items': []
                }

        # เพิ่มรายการ
        stkcod = str(row.get('STKCOD', '') or '').strip()
        stkdes = str(row.get('STKDES', '') or '').strip()
        if (stkcod or stkdes) and cur_key is not None:
            groups[cur_key]['items'].append({
                'STKCOD':   stkcod,
                'LOCCOD':   str(row.get('LOCCOD',  '01')  or '01').strip(),
                'SEQNUM':   str(row.get('SEQNUM',  '') or '').strip(),
                'TRNQTY':   row.get('TRNQTY', 1),
                'TQUCOD':   str(row.get('TQUCOD', 'AA')  or 'AA').strip(),
                'TFACTOR':  row.get('TFACTOR', 1),
                'UNITPR':   row.get('UNITPR', 0),
                'DISC':     str(row.get('DISC', '0') or '0').strip(),
                'STKDES':   stkdes,
                'SLMCOD':   str(row.get('SLMCOD', '') or '').strip(),
                'VATCOD':   str(row.get('VATCOD', '1') or '1').strip(),
                'ACCNUMDR': str(row.get('ACCNUMDR', '1130-01') or '1130-01').strip(),
                'ACCNUMCR': str(row.get('ACCNUMCR', '4100-00') or '4100-00').strip(),
                'DEPCOD':   str(row.get('DEPCOD', '') or '').strip(),
                'JOBCOD':   str(row.get('JOBCOD', '') or '').strip(),
            })

    # ── import แต่ละ Invoice ──
    results = []
    errors  = []

    for key in order:
        inv = groups[key]
        hdr = inv['header']
        itms = inv['items']

        if not itms:
            errors.append({'key': key, 'error': 'ไม่มีรายการสินค้า'})
            continue

        # Parse date
        invdt_obj = _parse_thai_date(hdr['INVDT'])
        if invdt_obj is None:
            errors.append({'key': key, 'error': f"วันที่ไม่ถูกต้อง: {hdr['INVDT']}"})
            continue

        duedt_obj = _parse_thai_date(hdr.get('DUEDT', ''))

        # Auto DOCNUM
        if not hdr['DOCNUM']:
            hdr['DOCNUM'] = _next_docnum(dbf_path, 'IN')

        hdr['DOCDAT_OBJ'] = invdt_obj
        hdr['DUEDAT_OBJ'] = duedt_obj
        hdr['VATRAT']     = float(hdr.get('VATRAT', 7) or 7)
        hdr['ADVAMT']     = float(hdr.get('ADVAMT', 0) or 0)

        try:
            res = _write_invoice(dbf_path, hdr, itms,
                                 artrn_fields, stcrd_fields,
                                 gljnl_fields, gljnlit_fields)
            results.append(res)
            logger.info(f'✓ {res["docnum"]} OK')
        except Exception as e:
            logger.exception(f'✗ {key}')
            errors.append({'key': key, 'error': str(e)})

    return jsonify({
        'success':      len(results) > 0,
        'imported':     len(results),
        'errors':       len(errors),
        'results':      results,
        'error_detail': errors,
    })

"""
import_in.py  v6
================
นำเข้าใบแจ้งหนี้ (IN) จาก Excel --> Express Accounting DBF
เขียน: ARTRN.DBF, STCRD.DBF, GLJNL.DBF, GLJNLIT.DBF
"""
import os, sys, argparse, traceback
import dbf
import openpyxl
from datetime import datetime, timedelta

# ============================================================
# CONFIG
# ============================================================
DEFAULT_DBF_PATH = r"Z:\jw-test"
DEFAULT_FLGVAT   = '2'
DEFAULT_VAT_RATE = 7.0
DEFAULT_CREDIT   = 30
DEFAULT_LOCCOD   = '01'
AR_ACCNUM        = '1130-01'   # Dr. ลูกหนี้การค้า
VAT_ACCNUM       = '2135-00'   # Cr. ภาษีขาย

# ============================================================
# HELPERS
# ============================================================
def parse_be_date(s) -> datetime:
    s = str(s).strip()
    d, m, y = s.split('/')
    y = int(y)
    if y < 100: y += 2500
    return datetime(y - 543, int(m), int(d))

def safe_str(v) -> str:
    return str(v).strip() if v is not None else ''

def safe_float(v) -> float:
    try: return float(v) if v is not None else 0.0
    except: return 0.0

def safe_int(v) -> int:
    try: return int(v) if v is not None else 0
    except: return 0

def stkcod_to_accnum(stkcod: str) -> str:
    """4110-02-04 --> 4100-02,  4100-02-09 --> 4100-02"""
    parts = stkcod.strip().split('-')
    if len(parts) >= 2:
        first = parts[0]
        if first.endswith('10'):
            first = first[:-2] + '00'
        return f"{first}-{parts[1]}"
    return stkcod

# ============================================================
# READ EXCEL
# ============================================================
def read_excel(path: str) -> dict:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb['Items']
    data_rows = list(ws.iter_rows(values_only=True))[2:]
    docs = {}
    cur_doc = cur_date = cur_cus = None
    for row in data_rows:
        if not any(c is not None for c in row): continue
        row_data = list(row) + [None] * 12  # pad ถ้า column น้อยกว่า
        trndat_raw = row_data[0]
        docnum     = row_data[1]
        seqnum     = row_data[2]
        cuscod     = row_data[3]
        # col 4 = ชื่อลูกค้า (skip)
        cusnam     = safe_str(row_data[4]) if row_data[4] else ''
        stkcod     = row_data[5]
        stkdes     = row_data[6]
        trnqty     = row_data[7]
        tqucod     = row_data[8]
        unitpr     = row_data[9]
        trnval     = row_data[10]
        item_flgvat = safe_int(row_data[11]) if row_data[11] is not None else -1
        # -1 = ไม่ได้ระบุ (ใช้ default จาก doc level)
        if trndat_raw is not None: cur_date = parse_be_date(trndat_raw)
        if docnum     is not None: cur_doc  = safe_str(docnum)
        if cuscod     is not None: cur_cus  = safe_str(cuscod)
        if cur_doc is None: continue
        if cur_doc not in docs:
            docs[cur_doc] = {'docdat': cur_date, 'cuscod': cur_cus, 'cusnam': cusnam, 'items': []}
        else:
            if trndat_raw is not None: docs[cur_doc]['docdat'] = cur_date
            if cuscod     is not None: docs[cur_doc]['cuscod'] = cur_cus
        docs[cur_doc]['items'].append({
            'seqnum'  : safe_int(seqnum),
            'stkcod'  : safe_str(stkcod),
            'stkdes'  : safe_str(stkdes),
            'trnqty'  : safe_float(trnqty),
            'tqucod'  : safe_str(tqucod) or 'AA',
            'unitpr'  : safe_float(unitpr),
            'trnval'  : safe_float(trnval),
            'flgvat'  : item_flgvat,   # 0=ไม่มีแวต, 1=แยก, 2=รวม, -1=ไม่ระบุ
        })
    wb.close()
    return docs

# ============================================================
# DUPLICATE CHECK
# ============================================================
def get_existing_docnums(artrn_path: str) -> set:
    existing = set()
    if not os.path.exists(artrn_path): return existing
    t = dbf.Table(artrn_path)
    t.open(dbf.READ_ONLY)
    for rec in t:
        try:
            if safe_str(rec['RECTYP']) == '3':
                existing.add(safe_str(rec['DOCNUM']))
        except: pass
    t.close()
    return existing

# ============================================================
# GL POSTING
# ============================================================
def post_gl(docnum, docdat, cuscod, cusnam, items, vatamt, netamt, dbf_path):
    ddate = docdat.date() if isinstance(docdat, datetime) else docdat
    gljnl_path   = os.path.join(dbf_path, 'GLJNL.DBF')
    gljnlit_path = os.path.join(dbf_path, 'GLJNLIT.DBF')
    for p in [gljnl_path, gljnlit_path]:
        if not os.path.exists(p):
            raise FileNotFoundError(f"ไม่พบ: {p}")

    jnl   = dbf.Table(gljnl_path,   codepage='cp874')
    jnlit = dbf.Table(gljnlit_path, codepage='cp874')
    jnl.open(dbf.READ_WRITE)
    jnlit.open(dbf.READ_WRITE)

    jnl.append({
        'JNLTYP' : '03',       # IN = '03' (จาก Z:\jw2568)
        'VOUCHER': docnum,
        'VOUDAT' : ddate,
        'SRCJNL' : 'IN',
        'DESCRP' : f'IN {docnum}',
        'TRNSTAT': 'P',        # Posted = 'P'
        'DOCSTAT': 'N',
        'CREBY'  : 'BIT9',
        'USERID' : 'BIT9',
    })

    # Dr. ลูกหนี้ — SEQIT='2', TRNTYP='0'
    jnlit.append({
        'VOUCHER': docnum, 'SEQIT': '2', 'VOUDAT': ddate,
        'ACCNUM': AR_ACCNUM, 'DESCRP': f'ขายเชื่อให้ {cusnam or cuscod}'[:50],
        'TRNTYP': '0', 'AMOUNT': netamt,
    })

    # Cr. รายได้ per item — SEQIT='5', TRNTYP='1'
    for item in items:
        acc = stkcod_to_accnum(item['stkcod'])
        jnlit.append({
            'VOUCHER': docnum, 'SEQIT': '5', 'VOUDAT': ddate,
            'ACCNUM': acc, 'DESCRP': f'ขายเชื่อให้ {cusnam or cuscod}'[:50],
            'TRNTYP': '1', 'AMOUNT': item['trnval'],
        })

    # Cr. ภาษีขาย — SEQIT='5', TRNTYP='1'
    if vatamt != 0:
        jnlit.append({
            'VOUCHER': docnum, 'SEQIT': '5', 'VOUDAT': ddate,
            'ACCNUM': VAT_ACCNUM, 'DESCRP': f'ขายเชื่อให้ {cusnam or cuscod}'[:50],
            'TRNTYP': '1', 'AMOUNT': vatamt,
        })

    jnl.close()
    jnlit.close()

    # อัปเดต GLBAL
    try:
        update_glbal(docnum, docdat, items, vatamt, netamt, dbf_path, cusnam)
    except Exception as e:
        print(f'GLBAL warning: {e}')

    # อัปเดต POSTGL='Y' ใน ARTRN
    artrn_path = os.path.join(dbf_path, 'ARTRN.DBF')
    t = dbf.Table(artrn_path, codepage='cp874')
    t.open(dbf.READ_WRITE)
    for rec in t:
        try:
            if safe_str(rec['DOCNUM']) == docnum and safe_str(rec['RECTYP']) == '3':
                with rec:
                    rec['POSTGL'] = 'Y'
                break
        except: pass
    t.close()

# ============================================================
# DELETE
# ============================================================
def delete_docnums(docnums: list, dbf_path: str = DEFAULT_DBF_PATH):
    # ARTRN/STCRD ใช้ DOCNUM, GLJNL/GLJNLIT ใช้ VOUCHER
    field_map = {
        'ARTRN.DBF'  : 'DOCNUM',
        'STCRD.DBF'  : 'DOCNUM',
        'GLJNL.DBF'  : 'VOUCHER',
        'GLJNLIT.DBF': 'VOUCHER',
    }
    for fname, key_field in field_map.items():
        fpath = os.path.join(dbf_path, fname)
        if not os.path.exists(fpath): continue
        t = dbf.Table(fpath, codepage='cp874')
        t.open(dbf.READ_WRITE)
        for rec in t:
            try:
                if safe_str(rec[key_field]) in docnums:
                    dbf.delete(rec)
            except: pass
        t.pack()
        t.close()
        print(f"  {fname}: ลบเสร็จ")

# ============================================================
# IMPORT
# ============================================================
def import_in_from_excel(
    excel_path : str,
    dbf_path   : str   = DEFAULT_DBF_PATH,
    flgvat     : str   = DEFAULT_FLGVAT,
    vat_rate   : float = DEFAULT_VAT_RATE,
    credit     : int   = DEFAULT_CREDIT,
    loccod     : str   = DEFAULT_LOCCOD,
    skip_dup   : bool  = True,
) -> dict:

    for fname in ['ARTRN.DBF', 'STCRD.DBF']:
        if not os.path.exists(os.path.join(dbf_path, fname)):
            raise FileNotFoundError(f"ไม่พบ: {os.path.join(dbf_path, fname)}")

    docs     = read_excel(excel_path)
    existing = get_existing_docnums(os.path.join(dbf_path, 'ARTRN.DBF')) if skip_dup else set()

    artrn = dbf.Table(os.path.join(dbf_path, 'ARTRN.DBF'), codepage='cp874')
    stcrd = dbf.Table(os.path.join(dbf_path, 'STCRD.DBF'), codepage='cp874')
    artrn.open(dbf.READ_WRITE)
    stcrd.open(dbf.READ_WRITE)

    imported, skipped, errors = [], [], []

    for docnum, doc in docs.items():
        if docnum in existing:
            skipped.append(docnum); continue
        try:
            docdat  = doc['docdat'] or datetime.today()
            ddate   = docdat.date()
            cuscod  = doc['cuscod'] or ''
            cusnam  = doc.get('cusnam', '')
            items   = doc['items']
            amount  = round(sum(i['unitpr'] * i['trnqty'] for i in items), 2)
            discamt = round(sum(max(0, i['unitpr']*i['trnqty'] - i['trnval']) for i in items), 2)
            aftdisc = round(amount - discamt, 2)       # ยอดหลังส่วนลด
            # VAT เฉพาะ item ที่ flgvat != 0 (0=ไม่มีแวต)
            vat_base = round(sum(i['trnval'] for i in items if i.get('flgvat', -1) != 0), 2)
            vatamt   = round(vat_base * vat_rate / 100, 2) if vat_base > 0 else 0.0
            netamt   = round(aftdisc + vatamt, 2)
            duedat  = (docdat + timedelta(days=credit)).date()

            artrn.append({
                'RECTYP': '3', 'DOCNUM': docnum, 'DOCDAT': ddate,
                'FLGVAT': flgvat, 'CUSCOD': cuscod,
                'PAYTRM': credit, 'DUEDAT': duedat,
                'NXTSEQ': str(len(items)),
                'AMOUNT': amount, 'DISCAMT': discamt, 'AFTDISC': aftdisc,
                'TOTAL': aftdisc, 'VATRAT': vat_rate,
                'VATAMT': vatamt, 'NETAMT': netamt,
                'NETVAL': netamt, 'REMAMT': netamt,
                'CMPLAPP': 'N', 'DOCSTAT': 'N', 'SRV_VATTYP': flgvat,
                'VATDAT': ddate if flgvat != '0' else None,
            })

            for item in items:
                discamt_i = round(item['unitpr'] * item['trnqty'] - item['trnval'], 2)
                stcrd.append({
                    'STKCOD': item['stkcod'], 'LOCCOD': loccod,
                    'DOCNUM': docnum, 'SEQNUM': str(item['seqnum']),
                    'DOCDAT': ddate, 'POSOPR': '9', 'PEOPLE': cuscod,
                    'TRNQTY': item['trnqty'], 'TQUCOD': item['tqucod'][:2],
                    'TFACTOR': 1.0, 'UNITPR': item['unitpr'],
                    'DISCAMT': discamt_i, 'TRNVAL': item['trnval'],
                    'XTRNQTY': item['trnqty'],
                    'XSALVAL': item['trnval'], 'NETVAL': item['trnval'],
                    'STKDES': item['stkdes'][:50],
                    'VATCOD': 'N' if item.get('flgvat', -1) == 0 else 'Y',
                })

            imported.append(docnum)

            try:
                post_gl(docnum, docdat, cuscod, cusnam, items, vatamt, netamt, dbf_path)
            except Exception as ge:
                errors.append({'docnum': docnum + '_GL', 'error': str(ge),
                               'trace': traceback.format_exc()})

        except Exception as e:
            errors.append({'docnum': docnum, 'error': str(e),
                           'trace': traceback.format_exc()})

    artrn.close()
    stcrd.close()
    return {'imported': imported, 'skipped': skipped, 'errors': errors}


# ============================================================
# UPDATE GLBAL
# ============================================================
def update_glbal(docnum, docdat, items, vatamt, netamt, dbf_path, cusnam=''):
    """อัปเดต GLBAL.DBF — ยอดรายเดือนต่อบัญชี"""
    from datetime import datetime
    glbal_path = os.path.join(dbf_path, 'GLBAL.DBF')
    if not os.path.exists(glbal_path):
        return

    ddate  = docdat.date() if isinstance(docdat, datetime) else docdat
    month  = ddate.month   # 1-12
    dr_fld = f'DEBIT{month}'    # เช่น DEBIT12
    cr_fld = f'CREDIT{month}'   # เช่น CREDIT12

    # สร้าง dict: {accnum: {dr: amount, cr: amount}}
    gl_entries = {}   # accnum -> (debit, credit)

    # Dr. ลูกหนี้
    gl_entries[AR_ACCNUM] = (netamt, 0.0)

    # Cr. รายได้ per item
    for item in items:
        acc = stkcod_to_accnum(item['stkcod'])
        dr, cr = gl_entries.get(acc, (0.0, 0.0))
        gl_entries[acc] = (dr, cr + item['trnval'])

    # Cr. ภาษีขาย
    if vatamt != 0:
        dr, cr = gl_entries.get(VAT_ACCNUM, (0.0, 0.0))
        gl_entries[VAT_ACCNUM] = (dr, cr + vatamt)

    glbal = dbf.Table(glbal_path, codepage='cp874')
    glbal.open(dbf.READ_WRITE)

    # อ่าน ACCNUM ที่มีอยู่แล้ว
    existing = {}
    for rec in glbal:
        try:
            acc = safe_str(rec['ACCNUM'])
            if acc:
                existing[acc] = rec
        except: pass

    for acc, (dr_amt, cr_amt) in gl_entries.items():
        if not acc: continue
        if acc in existing:
            rec = existing[acc]
            try:
                with rec:
                    if dr_amt:
                        cur = rec[dr_fld] or 0.0
                        rec[dr_fld] = round(cur + dr_amt, 2)
                    if cr_amt:
                        cur = rec[cr_fld] or 0.0
                        rec[cr_fld] = round(cur + cr_amt, 2)
            except Exception as e:
                pass
        else:
            # สร้าง record ใหม่
            try:
                row = {'ACCNUM': acc}
                if 'CALSTA' in glbal.field_names:
                    row['CALSTA'] = '1' * 24
                if dr_amt and dr_fld in glbal.field_names:
                    row[dr_fld] = dr_amt
                if cr_amt and cr_fld in glbal.field_names:
                    row[cr_fld] = cr_amt
                glbal.append(row)
            except Exception as e:
                pass

    glbal.close()

# ============================================================
# FLASK ROUTE
# ============================================================
def register_routes(app):
    from flask import request, jsonify

    @app.route('/import-in', methods=['POST'])
    def route_import_in():
        data = request.get_json(force=True)
        excel_path = data.get('excel_path', '')
        dbf_path   = data.get('dbf_path', DEFAULT_DBF_PATH)
        if not excel_path or not os.path.exists(excel_path):
            return jsonify({'success': False, 'error': f'ไม่พบ: {excel_path}'}), 400
        try:
            result = import_in_from_excel(
                excel_path, dbf_path,
                flgvat=data.get('flgvat', DEFAULT_FLGVAT),
                credit=int(data.get('credit', DEFAULT_CREDIT)),
            )
            return jsonify({'success': not result['errors'], **result})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e),
                            'trace': traceback.format_exc()}), 500

# ============================================================
# CLI
# ============================================================
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Import IN --> Express Accounting')
    parser.add_argument('excel',    nargs='?')
    parser.add_argument('--dbf',    default=DEFAULT_DBF_PATH)
    parser.add_argument('--credit', type=int, default=DEFAULT_CREDIT)
    parser.add_argument('--flgvat', default=DEFAULT_FLGVAT)
    parser.add_argument('--delete', nargs='+', metavar='DOCNUM')
    args = parser.parse_args()

    if args.delete:
        print(f"กำลังลบ: {args.delete}")
        delete_docnums(args.delete, args.dbf)
        print("Done."); sys.exit(0)

    if not args.excel:
        parser.print_help(); sys.exit(1)
    if not os.path.exists(args.excel):
        print(f"ERROR: ไม่พบ {args.excel}"); sys.exit(1)

    print(f"Import IN --> Express Accounting")
    print(f"  Excel  : {args.excel}")
    print(f"  DBF    : {args.dbf}")
    print(f"  VAT    : {DEFAULT_VAT_RATE}%  FLGVAT={args.flgvat}")
    print(f"  Credit : {args.credit} days\n")

    result = import_in_from_excel(
        excel_path=args.excel, dbf_path=args.dbf,
        flgvat=args.flgvat, credit=args.credit,
    )

    if result['imported']:
        print(f"OK: {len(result['imported'])} imported:")
        for d in result['imported']: print(f"   + {d}")
    if result['skipped']:
        print(f"SKIP: {len(result['skipped'])} duplicate(s):")
        for d in result['skipped']: print(f"   - {d}")
    if result['errors']:
        print(f"ERROR: {len(result['errors'])} failed:")
        for e in result['errors']:
            print(f"   ! {e['docnum']}: {e['error']}")
            if e.get('trace'): print(e['trace'])
    if not result['errors']:
        print("Done.")

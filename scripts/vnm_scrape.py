"""Respectful per-laboratorio scraper for the ANMAT VNM public consultation.

Adapts afborga/ANMAT-Medicamentos-Scraper (MIT) with two key fixes:
  - extracts cells via JS textContent (the GTIN column is hidden, so Selenium's
    .text returned "" — which is why the original output had empty GTINs);
  - checkpoint/resume + polite delay so a long run can survive interruptions.

Requires: pip install selenium webdriver-manager  (+ a local Chrome install).
Laboratory list: scripts/vnm-laboratorios.csv (GS1-registered labs; sourced from
the afborga scraper repo, MIT). Feed the output CSV to build-drug-db-ar.mjs.

Usage:
  python vnm_scrape.py [max_labs]     # omit max_labs for the full run
Output: vnm_out.csv (append+dedup by certificado+gtin+presentacion), vnm_done.txt
"""
import sys, time, csv, os, json
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

HERE = os.path.dirname(os.path.abspath(__file__))
URL = "https://servicios.pami.org.ar/vademecum/views/consultaPublica/listado.zul"
LABS_FILE = os.path.join(HERE, "vnm-laboratorios.csv")
OUT_CSV = os.path.join(HERE, "vnm_out.csv")
DONE_FILE = os.path.join(HERE, "vnm_done.txt")
DELAY = 1.2  # polite pause after each action

MAX_LABS = int(sys.argv[1]) if len(sys.argv) > 1 else None

# Extract the results grid rows via JS textContent (captures hidden GTIN cell).
EXTRACT_JS = r"""
const trs=[...document.querySelectorAll('tr.z-row')];
const out=[];
for(const tr of trs){
  const c=[...tr.querySelectorAll('td')].map(td=>(td.textContent||'').trim());
  // result rows: >=8 cells, cell[1] numeric certificado
  if(c.length>=8 && /^\d{3,6}$/.test(c[1])) {
    out.push({cert:c[1],lab:c[2],com:c[3],forma:c[4],pres:c[5],gtin:c[6],gen:c[7]});
  }
}
return out;
"""

def make_driver():
    o = Options()
    for a in ["--headless=new","--disable-gpu","--no-sandbox","--window-size=1400,900","--log-level=3"]:
        o.add_argument(a)
    o.add_experimental_option("excludeSwitches", ["enable-logging"])
    d = webdriver.Chrome(options=o)
    d.set_page_load_timeout(60)
    return d

def scrape_lab(driver, wait, lab):
    driver.get(URL); time.sleep(3)
    box = wait.until(EC.presence_of_element_located((By.ID, "zk_comp_40-real")))
    box.click(); time.sleep(DELAY)
    popup = wait.until(EC.presence_of_element_located((By.ID, "zk_comp_53")))
    popup.clear(); popup.send_keys(lab[:30]); time.sleep(DELAY)
    try:
        driver.find_element(By.ID, "zk_comp_54").click()
    except Exception:
        popup.send_keys(Keys.ENTER)
    time.sleep(1.5)
    items = driver.find_elements(By.XPATH, "//div[@id='zk_comp_56']//tr[contains(@class,'z-listitem')]")
    if not items:
        driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
        return []
    items[0].click(); time.sleep(DELAY)
    wait.until(EC.element_to_be_clickable((By.ID, "zk_comp_80"))).click()
    time.sleep(2)
    def click_next():
        for nb in driver.find_elements(By.CSS_SELECTOR, "a.z-paging-next, .z-paging-button-next, .z-paging a[title*='igui'], .z-paging button"):
            cls = (nb.get_attribute("class") or "").lower()
            if "disabled" not in cls and nb.is_displayed():
                try: nb.click(); return True
                except Exception: pass
        return False

    all_rows, seen_lab, page = [], set(), 0
    time.sleep(DELAY)
    while page < 80:
        rows = driver.execute_script(EXTRACT_JS)
        for r in rows:
            k = (r["cert"], r["gtin"], r["pres"])
            if k not in seen_lab:
                seen_lab.add(k); all_rows.append(r)
        first = rows[0]["cert"] if rows else ""
        if not click_next():
            break
        # Wait until the grid's first row actually changes (page advanced) — up
        # to ~4s — otherwise assume we were on the last page and stop.
        advanced = False
        for _ in range(16):
            time.sleep(0.25)
            r2 = driver.execute_script(EXTRACT_JS)
            if r2 and r2[0]["cert"] != first:
                advanced = True; break
        if not advanced:
            break
        page += 1
    return all_rows

def main():
    # LaboratoriosANMAT.txt is CSV: CUIT, GLN, "Razón Social" — use the name col.
    labs = [r["Razón Social"].strip() for r in csv.DictReader(open(LABS_FILE, encoding="utf-8")) if r.get("Razón Social", "").strip()]
    if MAX_LABS:
        labs = labs[:MAX_LABS]
    done = set()
    if os.path.exists(DONE_FILE):
        done = set(l.strip() for l in open(DONE_FILE, encoding="utf-8"))
    seen = set()
    if os.path.exists(OUT_CSV):
        for r in csv.DictReader(open(OUT_CSV, encoding="utf-8")):
            seen.add((r["cert"], r["gtin"], r["pres"]))
    fresh = not os.path.exists(OUT_CSV)
    fcsv = open(OUT_CSV, "a", newline="", encoding="utf-8")
    w = csv.DictWriter(fcsv, fieldnames=["cert","lab","com","forma","pres","gtin","gen"])
    if fresh:
        w.writeheader()
    driver = make_driver(); wait = WebDriverWait(driver, 20)
    total_new = 0
    try:
        for i, lab in enumerate(labs):
            if lab in done:
                continue
            try:
                rows = scrape_lab(driver, wait, lab)
            except Exception as e:
                print(f"[{i+1}/{len(labs)}] {lab[:35]} ERROR {type(e).__name__}", flush=True)
                # recycle the driver on hard failures
                try: driver.quit()
                except Exception: pass
                driver = make_driver(); wait = WebDriverWait(driver, 20)
                continue
            new = 0
            for r in rows:
                k = (r["cert"], r["gtin"], r["pres"])
                if k in seen:
                    continue
                seen.add(k); w.writerow(r); new += 1
            total_new += new
            fcsv.flush()
            open(DONE_FILE, "a", encoding="utf-8").write(lab + "\n")
            gtins = sum(1 for r in rows if r["gtin"])
            print(f"[{i+1}/{len(labs)}] {lab[:35]:35} rows={len(rows):3} new={new:3} gtin={gtins:3} total={total_new}", flush=True)
    finally:
        fcsv.close()
        try: driver.quit()
        except Exception: pass
    print("DONE total_new=", total_new, flush=True)

if __name__ == "__main__":
    main()

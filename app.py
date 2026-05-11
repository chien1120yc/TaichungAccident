from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import requests
import io
import os
from functools import lru_cache
import time

app = Flask(__name__)
CORS(app)

# ─── 112年7月最新版 代碼對照表 ───────────────────────────────────────────────
CLIMAT_DICT = {"1":"風","2":"風沙","3":"霧或煙","4":"雪","5":"雨","6":"陰","7":"晴"}
LIGHT_DICT = {"1":"有照明且開啟","2":"有照明未開啟或故障","3":"無照明"}
ROAD_CATEGORY_DICT = {"1":"國道","2":"省道","3":"快速(公)道路","4":"縣道","5":"鄉道","6":"市區道路","7":"村里道路","8":"專用道路","9":"其他"}
ROAD_TYPE_DICT = {"1":"有遮斷器","2":"無遮斷器","3":"三岔路","4":"四岔路","5":"多岔路","6":"隧道","7":"地下道","8":"橋樑","9":"涵洞","10":"高架道路","11":"彎曲路及附近","12":"坡路","13":"直路","14":"圓環","15":"廣場","16":"休息站或服務區","17":"輕軌共用道路","18":"其他"}
ACCIDENT_LOCATION_DICT = {"1":"交岔路口內","2":"交岔口附近","3":"機慢車待轉區","4":"機慢車停等區","5":"交通島(含槽化線)","6":"迴轉道","7":"快車道","8":"慢車道","9":"一般車道(未劃分快慢車道)","10":"公車專用道","11":"機車專用道","12":"機車優先道","13":"自行車專用道","14":"路肩、路緣","15":"加速車道","16":"減速車道","17":"直線匝道","18":"環道匝道","19":"行人穿越道","20":"行人穿越道附近","21":"人行道","22":"人行道標線","23":"騎樓","24":"其他"}
PAVEMENT_DICT = {"1":"柏油","2":"水泥","3":"碎石","4":"其他鋪裝","5":"無鋪裝"}
ROAD_CONDITION_DICT = {"1":"冰雪","2":"油滑","3":"泥濘","4":"濕潤","5":"乾燥"}
ROAD_DEFECT_DICT = {"1":"路面鬆軟","2":"隆起或凹陷不平","3":"有坑洞","4":"無缺陷"}
BARRIER_DICT = {"1":"道路工事(程)中","2":"有堆積物","3":"路上有停車","4":"施工圍籬","5":"其他障礙物","6":"無障礙物"}
SIGNAL_TYPE_DICT = {"1":"行車管制號誌","2":"行車管制號誌(附設行人專用號誌)","3":"閃光號誌","4":"無號誌"}
ACCIDENT_TYPE_DICT = {"1":"對向通行中","2":"同向通行中","3":"穿越道路中","4":"在路上嬉戲","5":"在路上作業中","6":"衝進路中","7":"從停車後(或中)穿出","8":"佇立路邊(外)","9":"其他(人與車)","10":"對撞","11":"對向擦撞","12":"同向擦撞","13":"追撞","14":"倒車撞","15":"路口交岔撞","16":"側撞","17":"其他(車與車)","18":"路上翻車、摔倒","19":"衝出路外","20":"撞護欄(樁)","21":"撞號誌、標誌桿","22":"撞橋樑(橋墩)","23":"撞交通島","24":"撞非固定設施","25":"撞建築物","26":"撞路樹","27":"撞電桿","28":"撞動物","29":"撞工程施工","30":"其他(車輛本身)","31":"衝過(或撞壞)遮斷器","32":"正越過平交道中","33":"暫停位置不當","34":"在平交道內無法行動","35":"其他(平交道事故)"}
CAUSING_FACTOR_DICT = {
    "1":"違規超車", "2":"爭(搶)道行駛", "3":"危險駕駛", "4":"逆向行駛", "5":"超速駕駛",
    "6":"未依規定減速", "7":"未保持行車安全距離", "8":"未保持行車安全間隔", "9":"未遵守依法令授權交通指揮人員之指揮", "10":"車輛未依規定暫停讓行人先行",
    "11":"有號誌路口，轉彎車未讓直行車先行", "12":"無號誌路口，支線道未讓幹線道先行", "13":"無號誌路口，少線道未讓多線道先行", "14":"無號誌路口，轉彎車未讓直行車先行", "15":"無號誌路口，左方車未讓右方車先行",
    "16":"山路會車，靠山壁車未讓外緣車先行", "17":"峻狹坡路會車，下坡車未讓上坡車先行", "18":"行經圓環未依規定讓車", "19":"未依規定避讓執行緊急任務車", "20":"其他未依規定讓車",
    "21":"闖紅燈直行", "22":"闖紅燈右轉", "23":"闖紅燈左轉(或迴轉)", "24":"違反閃光號誌", "25":"違反其他號誌",
    "26":"違反遵行方向標誌(線)", "27":"違反車輛專用標誌(線)", "28":"違反行人專用標誌(線)", "29":"違反禁止進入標誌", "30":"違反禁止各種車輛進入標誌",
    "31":"違反禁止會車標誌", "32":"違反禁止迴轉或迴車標誌", "33":"違反車輛改道標誌", "34":"違反禁止超車標誌(線)", "35":"違反禁止變換車道標線",
    "36":"違反二段式左(右)轉標誌(線)", "37":"違反禁行車種標誌(字)", "38":"違反禁止左轉、右轉標誌", "39":"違反其他標誌(線)禁制", "40":"變換車道不當",
    "41":"未靠右行駛", "42":"方向不定(不包括危險駕車)", "43":"閃避不當(慎)", "44":"多車道迴轉，未先駛入內側車道", "45":"迴轉未依規定",
    "46":"橫越道路不慎", "47":"右轉彎未依規定", "48":"左轉彎未依規定", "49":"倒車未依規定", "50":"停車操作時未注意安全",
    "51":"起步時未注意安全", "52":"吸食違禁物駕駛", "53":"酒醉(後)駕駛", "54":"患病或服用藥物(疲勞)駕駛", "55":"打瞌睡或疲勞駕駛",
    "56":"飲食、抽(點)菸、拿(撿)物品分心駕駛", "57":"乘客、車上動(生)物干擾分心駕駛", "58":"觀看其他事故、活動、道路環境或車外資訊分心駕駛", "59":"恍神、緊張、心不在焉分心駕駛", "60":"使用車輛自動駕駛或先進駕駛輔助系統設備不符規定",
    "61":"操作、觀看行車輔助或娛樂性顯示設備", "62":"使用手持行動電話", "63":"搶(闖)越平交道", "64":"未保持平交道淨空", "65":"未依規定使用燈光",
    "66":"暗處停車無燈光、標識", "67":"夜間行駛無燈光設備", "68":"裝載貨物不穩妥", "69":"載運貨物超重", "70":"超載人員",
    "71":"載運貨物超長、寬、高", "72":"裝卸貨物不當", "73":"裝載未盡安全措施", "74":"未待乘客安全上下而開車", "75":"其他裝載不當",
    "76":"開啟或關閉車門不當", "77":"違規(臨時)停車", "78":"車輛未停妥滑動致生事故", "79":"車輛拋錨未採安全措施", "80":"發生事故後，未採取安全措施",
    "81":"被車輛輾壓之不明物體彈飛", "82":"車輛或機械操作不當(慎)", "83":"因光線、視線遮蔽致生事故", "84":"其他不當駕車行為", "85":"跡證不足當事人各執一詞，無法釐清肇因",
    "86":"肇事逃逸未查獲，無法查明肇因", "87":"尚未發現肇事因素", "88":"煞車失靈或故障", "89":"方向操縱系統故障", "90":"車輪脱落或輪胎爆裂",
    "91":"車輛零件脫落", "92":"燈光系統故障", "93":"車輛附屬機具未盡安全措施", "94":"其他機件失靈或故障", "95":"未依標誌或標線穿越道路",
    "96":"未依號誌或手勢指揮(示)穿越道路", "97":"未依規定行走地下道、天橋穿越道路", "98":"穿越道路未注意左右來車", "99":"在道路上嬉戲或奔走不定", "100":"搶(闖)越平交道",
    "101":"當事者逕自離開現場", "102":"開啟或關閉車門不當", "103":"頭手伸出車外", "104":"乘坐不當(慎)", "105":"未待車輛停妥而上下車",
    "106":"上下車輛時未注意安全", "107":"在道路上工作未設適當標識", "108":"指揮不當", "109":"其他引起事故之疏失或行為", "110":"平交道看守疏失或未放柵欄",
    "111":"路況危險無安全(警告)設施", "112":"施工防護措施未依規定", "113":"交通管制設施失靈或損毀", "114":"其他交通管制不當", "115":"道路設施植栽倒塌或掉落",
    "116":"物品滾(滑)或飛(掉)落", "117":"強風、暴雨、濃霧(煙)", "118":"動物竄出", "119":"尚未發現肇事因素"
}
INJURY_DEGREE_DICT = {"1":"24小時內死亡","2":"受傷","3":"未受傷","4":"不明","5":"2-30日內死亡"}
MAIN_INJURY_DICT = {"1":"頭部","2":"頭頸部","3":"胸部","4":"腹部","5":"腰部","6":"背脊部","7":"手(腕)部","8":"腿腳部","9":"多數傷","10":"無","11":"不明"}
PROTECTIVE_EQUIPMENT_DICT = {"1":"戴半罩式安全帽","2":"戴非半罩式安全帽","3":"有繫安全帶或幼童椅","4":"未戴安全帽或未繫安全帶","5":"不明","6":"其他(無需使用裝備)"}
DRINKING_SITUATION_DICT = {
    "1":"經觀察未飲酒", "2":"經檢測無酒精反應", "3":"呼氣未滿0.15mg/L", "4":"呼氣達0.15未滿0.25mg/L",
    "5":"呼氣達0.25未滿0.40mg/L", "6":"呼氣達0.40未滿0.55mg/L", "7":"呼氣達0.55未滿0.80mg/L", "8":"呼氣達0.80mg/L以上",
    "9":"駕駛人無法檢測", "10":"非駕駛人未檢測", "11":"駕駛人不明"
}

# ─── GitHub CSV 設定 ───────────────────────────────────────────────
# 在 GitHub repo 中，CSV 檔案放在 data/ 資料夾，格式: YYYMMDD.csv (民國年)
GITHUB_RAW_BASE = os.environ.get(
    "GITHUB_RAW_BASE",
    "https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/data"
)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_DATA_DIR = os.environ.get("LOCAL_DATA_DIR", os.path.join(BASE_DIR, "..", "data"))

_cache = {}
_cache_time = {}
CACHE_TTL = 3600  # 1 hour

def fetch_csv_from_github(filename: str):
    cache_key = filename
    now = time.time()
    if cache_key in _cache and (now - _cache_time.get(cache_key, 0)) < CACHE_TTL:
        return _cache[cache_key]

    if LOCAL_DATA_DIR:
        filepath = os.path.join(LOCAL_DATA_DIR, filename)
        if not os.path.exists(filepath):
            return None
        df = pd.read_csv(
            filepath,
            dtype=str,
            encoding='utf-8-sig',
            on_bad_lines='skip',
            engine='python'          # ← 加這行
        )
        df.columns = df.columns.str.strip().str.replace('\ufeff', '')
        df = df.fillna("")
        _cache[cache_key] = df
        _cache_time[cache_key] = now
        return df

    # 遠端模式（GitHub）
    url = f"{GITHUB_RAW_BASE}/{filename}"
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code != 200:
            return None
        content = resp.content.decode("utf-8-sig")
        df = pd.read_csv(io.StringIO(content), dtype=str, on_bad_lines='skip')
        df.columns = df.columns.str.strip().str.replace('\ufeff', '')
        _cache[cache_key] = df
        _cache_time[cache_key] = now
        return df
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def load_all_csvs(year: str, months: list[str]) -> pd.DataFrame:
    """Load and concatenate multiple month CSV files. year is ROC year (e.g. '114')."""
    dfs = []
    for m in months:
        filename = f"{year}{m.zfill(2)}.csv"
        df = fetch_csv_from_github(filename)
        if df is not None:
            dfs.append(df)
    if not dfs:
        return pd.DataFrame()
    return pd.concat(dfs, ignore_index=True)

def parse_params():
    """Parse common query params: year (ROC), months list."""
    year = request.args.get("year", "114")
    months_raw = request.args.get("months", "")
    if months_raw:
        months = [m.strip() for m in months_raw.split(",") if m.strip()]
    else:
        months = [str(i) for i in range(1, 13)]
    return year, months

# ─── 改良版的 map_col 函數，自動處理 '01' 與 '1' 的差異 ───────────────────────────────────────────────
def map_col(df: pd.DataFrame, col: str, mapping: dict) -> pd.DataFrame:
    df = df.copy()
    # 新增邏輯：如果該欄位的值是純數字（例如 "01", "084"），自動去掉開頭的 0 去配對字典
    df[col] = df[col].astype(str).map(
        lambda x: mapping.get(str(int(float(x))), x) if x.replace('.', '', 1).isdigit() else mapping.get(x, x)
    )
    return df

# ─── Health check ──────────────────────────────────────────────
@app.route("/")
def index():
    return jsonify({"status": "ok", "message": "台中市交通事故查詢 API"})

# ─── 共用：各區事故頻率 ─────────────────────────────────────────
@app.route("/api/district-frequency")
def district_frequency():
    year, months = parse_params()
    df = load_all_csvs(year, months)
    if df.empty:
        return jsonify({"error": "無法載入資料"}), 500
    if "區" not in df.columns:
        return jsonify({"error": "找不到區欄位"}), 400
    counts = df["區"].value_counts().reset_index()
    counts.columns = ["district", "count"]
    return jsonify(counts.to_dict(orient="records"))

# ─── 共用：肇事因素排行 ─────────────────────────────────────────
@app.route("/api/causing-factors")
def causing_factors():
    year, months = parse_params()
    top_n = int(request.args.get("top", 10))
    df = load_all_csvs(year, months)
    if df.empty:
        return jsonify({"error": "無法載入資料"}), 500
    col = "肇事因素主要" if "肇事因素主要" in df.columns else "肇事因素個別"
    if col not in df.columns:
        return jsonify({"error": "找不到肇事因素欄位"}), 400
    df = map_col(df, col, CAUSING_FACTOR_DICT)
    counts = df[col].value_counts().head(top_n).reset_index()
    counts.columns = ["factor", "count"]
    return jsonify(counts.to_dict(orient="records"))

# ─── 共用：最容易發生事故的時段 ────────────────────────────────
@app.route("/api/hourly-distribution")
def hourly_distribution():
    year, months = parse_params()
    df = load_all_csvs(year, months)
    if df.empty:
        return jsonify({"error": "無法載入資料"}), 500
    if "時" not in df.columns:
        return jsonify({"error": "找不到時間欄位"}), 400
    df["時"] = pd.to_numeric(df["時"], errors="coerce")
    counts = df["時"].value_counts().sort_index().reset_index()
    counts.columns = ["hour", "count"]
    counts["hour"] = counts["hour"].astype(int)
    return jsonify(counts.to_dict(orient="records"))

# ─── 共用：查詢車禍資料（依序號） ───────────────────────────────
@app.route("/api/search")
def search_accident():
    year, months = parse_params()
    serial = request.args.get("serial", "").strip()
    if not serial:
        return jsonify({"error": "請輸入序號"}), 400
    df = load_all_csvs(year, months)
    if df.empty:
        return jsonify({"error": "無法載入資料"}), 500
    # Try to find by 序號
    seq_col = [c for c in df.columns if "序號" in c]
    if not seq_col:
        return jsonify({"error": "找不到序號欄位"}), 400
    col = seq_col[0]
    df[col] = df[col].astype(str).str.strip().str.strip('"')
    result = df[df[col] == serial.strip()]
    if result.empty:
        return jsonify({"found": False, "data": []})
    # Map coded values
    row = result.iloc[0].to_dict()
    mappings = {
        "天候": CLIMAT_DICT, "道路照明設備": LIGHT_DICT,
        "道路類別": ROAD_CATEGORY_DICT, "道路型態": ROAD_TYPE_DICT,
        "事故位置": ACCIDENT_LOCATION_DICT, "路面鋪裝": PAVEMENT_DICT,
        "路面狀態": ROAD_CONDITION_DICT, "路面缺陷": ROAD_DEFECT_DICT,
        "障礙物": BARRIER_DICT, "號誌種類": SIGNAL_TYPE_DICT,
        "事故類型及型態": ACCIDENT_TYPE_DICT, "肇事因素主要": CAUSING_FACTOR_DICT,
        "肇事因素個別": CAUSING_FACTOR_DICT, "受傷程度": INJURY_DEGREE_DICT,
        "主要傷處": MAIN_INJURY_DICT, "保護裝備": PROTECTIVE_EQUIPMENT_DICT,
        "飲酒情形": DRINKING_SITUATION_DICT,
    }
    for field, mapping in mappings.items():
        if field in row and row[field]:
            row[field] = mapping.get(str(row[field]), row[field])
    return jsonify({"found": True, "data": row})

# ─── 公家機關：保護裝備 × 主要傷處 ─────────────────────────────
@app.route("/api/equipment-injury")
def equipment_injury():
    year, months = parse_params()
    df = load_all_csvs(year, months)
    if df.empty:
        return jsonify({"error": "無法載入資料"}), 500
    if "保護裝備" not in df.columns or "主要傷處" not in df.columns:
        return jsonify({"error": "找不到必要欄位"}), 400
    df = map_col(df, "保護裝備", PROTECTIVE_EQUIPMENT_DICT)
    df = map_col(df, "主要傷處", MAIN_INJURY_DICT)
    pivot = df.groupby(["保護裝備", "主要傷處"]).size().reset_index(name="count")
    pivot = pivot[pivot["保護裝備"] != "nan"][pivot["主要傷處"] != "nan"]
    return jsonify(pivot.to_dict(orient="records"))

# ─── 公家機關：飲酒程度 × 受傷程度 ─────────────────────────────
@app.route("/api/drinking-injury")
def drinking_injury():
    year, months = parse_params()
    df = load_all_csvs(year, months)
    if df.empty:
        return jsonify({"error": "無法載入資料"}), 500
    if "飲酒情形" not in df.columns or "受傷程度" not in df.columns:
        return jsonify({"error": "找不到必要欄位"}), 400
    df = map_col(df, "飲酒情形", DRINKING_SITUATION_DICT)
    df = map_col(df, "受傷程度", INJURY_DEGREE_DICT)
    pivot = df.groupby(["飲酒情形", "受傷程度"]).size().reset_index(name="count")
    pivot = pivot[pivot["飲酒情形"] != "nan"][pivot["受傷程度"] != "nan"]
    return jsonify(pivot.to_dict(orient="records"))

# ─── 公家機關：天候 × 事故位置 ──────────────────────────────────
@app.route("/api/weather-location")
def weather_location():
    year, months = parse_params()
    df = load_all_csvs(year, months)
    if df.empty:
        return jsonify({"error": "無法載入資料"}), 500
    if "天候" not in df.columns or "事故位置" not in df.columns:
        return jsonify({"error": "找不到必要欄位"}), 400
    df = map_col(df, "天候", CLIMAT_DICT)
    df = map_col(df, "事故位置", ACCIDENT_LOCATION_DICT)
    pivot = df.groupby(["天候", "事故位置"]).size().reset_index(name="count")
    pivot = pivot[pivot["天候"] != "nan"][pivot["事故位置"] != "nan"]
    return jsonify(pivot.to_dict(orient="records"))

# ─── 公家機關：各區路面缺陷肇事 ──────────────────────────────────
@app.route("/api/road-defect-district")
def road_defect_district():
    year, months = parse_params()
    df = load_all_csvs(year, months)
    if df.empty:
        return jsonify({"error": "無法載入資料"}), 500
    if "路面缺陷" not in df.columns or "區" not in df.columns:
        return jsonify({"error": "找不到必要欄位"}), 400
    # Only include actual defects (exclude 無缺陷)
    df = map_col(df, "路面缺陷", ROAD_DEFECT_DICT)
    defects = df[df["路面缺陷"].isin(["路面鬆軟", "隆起或凹陷不平", "有坑洞"])]
    pivot = defects.groupby(["區", "路面缺陷"]).size().reset_index(name="count")
    pivot = pivot[pivot["區"] != "nan"]
    return jsonify(pivot.to_dict(orient="records"))

# ─── 公家機關：時段 × 主要肇因 ───────────────────────────────────
@app.route("/api/time-factor")
def time_factor():
    year, months = parse_params()
    df = load_all_csvs(year, months)
    if df.empty:
        return jsonify({"error": "無法載入資料"}), 500
    if "時" not in df.columns or "肇事因素主要" not in df.columns:
        return jsonify({"error": "找不到必要欄位"}), 400
    df["時"] = pd.to_numeric(df["時"], errors="coerce")
    bins = [0, 6, 9, 12, 15, 18, 21, 24]
    labels = ["凌晨(0-6)", "早高峰(6-9)", "上午(9-12)", "下午(12-15)", "傍晚(15-18)", "夜間(18-21)", "深夜(21-24)"]
    df["時段"] = pd.cut(df["時"], bins=bins, labels=labels, right=False, include_lowest=True)
    df = map_col(df, "肇事因素主要", CAUSING_FACTOR_DICT)
    # Top 5 factor per period
    grouped = df.groupby(["時段", "肇事因素主要"]).size().reset_index(name="count")
    grouped = grouped[grouped["肇事因素主要"] != "nan"]
    grouped = grouped.sort_values(["時段", "count"], ascending=[True, False])
    top = grouped.groupby("時段").head(5).reset_index(drop=True)
    top["時段"] = top["時段"].astype(str)
    return jsonify(top.to_dict(orient="records"))

# ─── 公家機關：各區酒駕排名 ──────────────────────────────────────
@app.route("/api/drunk-driving-district")
def drunk_driving_district():
    year, months = parse_params()
    df = load_all_csvs(year, months)
    if df.empty:
        return jsonify({"error": "無法載入資料"}), 500
    if "飲酒情形" not in df.columns or "區" not in df.columns:
        return jsonify({"error": "找不到必要欄位"}), 400
    # 飲酒代碼 2,3,4,5 = 有飲酒
    drunk = df[df["飲酒情形"].astype(str).isin(["2", "3", "4", "5"])]
    counts = drunk["區"].value_counts().reset_index()
    counts.columns = ["district", "count"]
    counts = counts[counts["district"] != "nan"]
    counts["rank"] = range(1, len(counts) + 1)
    return jsonify(counts.to_dict(orient="records"))

# ─── 工具：列出可用月份 ────────────────────────────────────────
@app.route("/api/available-months")
def available_months():
    year = request.args.get("year", "114")
    available = []
    for m in range(1, 13):
        filename = f"{year}{str(m).zfill(2)}.csv"
        url = f"{GITHUB_RAW_BASE}/{filename}"
        try:
            resp = requests.head(url, timeout=5)
            if resp.status_code == 200:
                available.append(m)
        except:
            pass
    return jsonify({"year": year, "available_months": available})

if __name__ == "__main__":
    app.run(debug=True, port=5000)

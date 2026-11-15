"""Shared helpers for the TERRA Word reports: paths, one chart style, and python-docx helpers.

Run the report builders from the repo root with the pipeline venv (matplotlib + python-docx installed there):
  "docs/Data Pipeline/.venv/Scripts/python.exe" -I scripts/reports/build_data_report.py
  "docs/Data Pipeline/.venv/Scripts/python.exe" -I scripts/reports/build_model_report.py
"""

from __future__ import annotations

import csv
import json
import subprocess
from datetime import date
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from docx import Document  # noqa: E402
from docx.enum.table import WD_TABLE_ALIGNMENT  # noqa: E402
from docx.shared import Cm, Pt, RGBColor  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
PIPE = REPO / "docs" / "Data Pipeline"
DATA = PIPE / "data"
EXT = DATA / "external"
OUT = REPO / "docs" / "reports"
FIG = OUT / "figures"
RESULTS = OUT / "data"

# Colour-vision-safe palette (Okabe–Ito), one meaning per colour across all charts.
C = {
    "power": "#009E73",   # NASA POWER (model)
    "imerg": "#0072B2",   # GPM IMERG (satellite)
    "smap": "#56B4E9",    # SMAP L3 (satellite)
    "l4s": "#E69F00",     # SMAP L4 surface (model)
    "l4r": "#D55E00",     # SMAP L4 root zone (model)
    "ndvi": "#009E73",
    "hls": "#CC79A7",
    "grey": "#7F7F7F",
    "dry": "#E69F00",
    "wet": "#0072B2",
    "old": "#999999",
    "new": "#0072B2",
}

plt.rcParams.update({
    "figure.dpi": 150, "savefig.dpi": 200, "font.size": 9, "axes.titlesize": 10, "axes.labelsize": 9,
    "axes.spines.top": False, "axes.spines.right": False, "legend.frameon": False, "legend.fontsize": 8,
})


def git_commit() -> str:
    head = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
    dirty = bool(subprocess.run(["git", "status", "--porcelain"], cwd=REPO, capture_output=True, text=True).stdout.strip())
    return f"{head}{' + uncommitted changes' if dirty else ''}"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def to_date(s: str) -> date:
    return date.fromisoformat(s[:10])


def date_axis(ax, every_months: int = 3):
    """Readable time axis: a tick every few months, labelled 'Jan 2024'."""
    import matplotlib.dates as mdates
    ax.xaxis.set_major_locator(mdates.MonthLocator(bymonth=list(range(1, 13, every_months))))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
    for lab in ax.get_xticklabels():
        lab.set_fontsize(7.5)


def legend_below(ax, ncol: int = 3):
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.14), ncol=ncol, fontsize=7.5)


def save(fig, name: str) -> Path:
    FIG.mkdir(parents=True, exist_ok=True)
    p = FIG / f"{name}.png"
    fig.tight_layout()
    fig.savefig(p, bbox_inches="tight")
    plt.close(fig)
    return p


class Report:
    """Thin wrapper over python-docx with the few blocks the reports use."""

    def __init__(self, title: str, subtitle: str):
        self.doc = Document()
        st = self.doc.styles["Normal"]
        st.font.name = "Calibri"
        st.font.size = Pt(10.5)
        for s in self.doc.sections:
            s.left_margin = s.right_margin = Cm(2.2)
            s.top_margin = s.bottom_margin = Cm(2.0)
        self.doc.add_heading(title, level=0)
        p = self.doc.add_paragraph(subtitle)
        p.runs[0].italic = True
        self.figures = 0
        self.tables = 0

    def h1(self, text: str):
        self.doc.add_heading(text, level=1)

    def h2(self, text: str):
        self.doc.add_heading(text, level=2)

    def p(self, text: str, bold_lead: str | None = None):
        para = self.doc.add_paragraph()
        if bold_lead:
            para.add_run(bold_lead).bold = True
        para.add_run(text)
        return para

    def bullets(self, items: list[str]):
        for it in items:
            if isinstance(it, tuple):
                para = self.doc.add_paragraph(style="List Bullet")
                para.add_run(it[0]).bold = True
                para.add_run(it[1])
            else:
                self.doc.add_paragraph(it, style="List Bullet")

    def numbered(self, items: list[str]):
        for it in items:
            self.doc.add_paragraph(it, style="List Number")

    def table(self, header: list[str], rows: list[list[str]], caption: str | None = None, widths: list[float] | None = None):
        self.tables += 1
        if caption:
            cp = self.doc.add_paragraph()
            r = cp.add_run(f"Table {self.tables}. {caption}")
            r.bold = True
            r.font.size = Pt(9.5)
        t = self.doc.add_table(rows=1, cols=len(header))
        t.style = "Light Grid Accent 1"
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        for i, h in enumerate(header):
            t.rows[0].cells[i].text = h
            for run in t.rows[0].cells[i].paragraphs[0].runs:
                run.bold = True
                run.font.size = Pt(9)
        for row in rows:
            cells = t.add_row().cells
            for i, v in enumerate(row):
                cells[i].text = str(v)
                for run in cells[i].paragraphs[0].runs:
                    run.font.size = Pt(9)
        if widths:
            for row in t.rows:
                for i, w in enumerate(widths):
                    row.cells[i].width = Cm(w)
        self.doc.add_paragraph()

    def figure(self, path: Path, caption: str, width_cm: float = 16.0):
        self.figures += 1
        self.doc.add_picture(str(path), width=Cm(width_cm))
        cp = self.doc.add_paragraph()
        r = cp.add_run(f"Figure {self.figures}. {caption}")
        r.italic = True
        r.font.size = Pt(9)
        r.font.color.rgb = RGBColor(0x40, 0x40, 0x40)

    def note(self, text: str):
        para = self.doc.add_paragraph()
        r = para.add_run(text)
        r.font.size = Pt(9)
        r.font.color.rgb = RGBColor(0x55, 0x55, 0x55)

    def save(self, name: str) -> Path:
        OUT.mkdir(parents=True, exist_ok=True)
        p = OUT / name
        self.doc.save(str(p))
        return p

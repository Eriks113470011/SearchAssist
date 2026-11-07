"""Read the supplied workbook, emit only aggregate counts. Requires openpyxl.
Usage: python docs/analyze_survey.py /path/to/responses.xlsx [output.json]
Raw respondent text is never exported. Do not add the raw workbook to the repo.
"""
import sys,json,hashlib
from collections import Counter
from pathlib import Path
from openpyxl import load_workbook
source=Path(sys.argv[1]);sheet=load_workbook(source,data_only=True).active
rows=list(sheet.values);headers=rows[0];data=[r for r in rows[1:] if r[0]]
# Some answer labels contain commas: count whole known labels, never split on commas.
options={28:['Misspelling prevented a useful result','I only knew part of the nam','An abbreviation was not recognized','No results were returned','Too many irrelevant results appeared','The correct result appeared too low','My query was corrected incorrectly','I did not understand why a result appeared','Search controls were difficult to navigate','Changing the word order changed the results'],31:['Highlighting the matching text','Showing a corrected spelling','Identifying a known alias','Showing whether the title, category, or description matched','Explaining that only part of the query matched','Identifying a known synonym','Showing that the words appeared in a different order','Identifying a recognized abbreviation','Showing the strength of the match','I do not want match explanations','Other'],34:['Show an editable suggestion before applying it','Correct it but provide an undo option','Never suggest corrections','Show results for both versions','Correct it automatically without asking'],42:['Corrected spelling suggestions','Categories or filters','The closest available matches','A way to browse manually','Related search terms','A clear message that nothing matched','Results containing only part of the query','Tips for rewriting the query']}
summary={'source_filename':source.name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sheet':sheet.title,'response_count':len(data),'consent_yes':sum(r[1]=='Yes' for r in data),'date_range':[str(min(r[0] for r in data)),str(max(r[0] for r in data))],'items':{},'quality_notes':[]}
for i in [2,3,6,13,*range(16,44),*range(46,51)]:
 if i==40:continue
 values=[str(r[i]).strip() for r in data if r[i] is not None]
 if i in options:counts={o:sum(o in v for v in values) for o in options[i]};valid=len(values)
 elif i==3:counts=dict(Counter(t for v in values for t in v.split(', ')));valid=len(values)
 else:
  if i in range(16,27):
   invalid=[v for v in values if v.lower() not in {'never','rarely','sometimes','often','very often'}]
   if invalid:summary['quality_notes'].append({'column_number':i+1,'invalid_values':dict(Counter(invalid)),'valid_n':len(values)-len(invalid)})
   values=[v for v in values if v not in invalid]
  counts=dict(Counter(values));valid=len(values)
 summary['items'][str(i+1)]={'question':headers[i],'valid_nonblank_n':valid,'overall_n':len(data),'counts':counts}
summary['quality_notes'] += ['One malformed top-frustration option excluded from option counts; respondent remains in denominator.','Truncated incomplete-name option normalized only for display.','All 26 response rows retained without formal quality screening.','Multiple-selection totals can exceed 26.','No efficacy or causal conclusions from survey responses.']
out=Path(sys.argv[2] if len(sys.argv)>2 else 'docs/survey-summary.json');out.write_text(json.dumps(summary,indent=2,ensure_ascii=False));print(f'Wrote aggregate summary: {len(data)} responses, {len(summary["items"])} items')
assert summary['items']['29']['counts']['Too many irrelevant results appeared']==15
assert summary['items']['35']['counts']['Show an editable suggestion before applying it']==15
assert summary['items']['32']['counts']['Showing whether the title, category, or description matched']==14

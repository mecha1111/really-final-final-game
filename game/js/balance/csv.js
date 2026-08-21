// 이 파일 역할: CSV 텍스트 → 자바스크립트 값으로 바꾸는 순수 파싱 함수들. 네트워크도 게임 상태도 모른다.

/**
 * CSV 텍스트를 행(문자열 배열)의 배열로 쪼갠다. 따옴표로 감싼 필드 안의
 * 쉼표/줄바꿈("", 이스케이프 포함)까지 올바르게 처리하는 최소 구현.
 */
function splitCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char === '\r') {
      // \r\n의 \r은 건너뛰고 다음 \n에서 줄을 끊는다
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** 컬럼값 하나를 규칙에 맞게 변환한다: stops_upload는 불린, 나머지는 숫자면 숫자로. */
function coerceValue(key, rawValue) {
  const trimmed = rawValue.trim();

  if (key === 'stops_upload') {
    return trimmed.toUpperCase() === 'TRUE';
  }

  if (trimmed === '') return trimmed;

  const asNumber = Number(trimmed);
  return Number.isNaN(asNumber) ? trimmed : asNumber;
}

/**
 * 헤더가 있는 CSV 텍스트를 행 객체 배열로 파싱한다.
 * note 컬럼(사람용 주석)은 결과에서 제외한다.
 */
export function parseCsv(text) {
  const rows = splitCsvRows(text).filter((r) => r.some((cell) => cell.trim() !== ''));
  if (rows.length < 1) return [];

  const header = rows[0].map((h) => h.trim());

  return rows.slice(1).map((row) => {
    const obj = {};
    header.forEach((key, i) => {
      if (key === 'note' || key === '') return;
      obj[key] = coerceValue(key, row[i] ?? '');
    });
    return obj;
  });
}

/** key,value,unit,note 형태의 행 배열을 key로 조회 가능한 맵으로 바꾼다. */
export function stageRowsToMap(rows) {
  const map = {};
  for (const row of rows) {
    if (!row.key) continue;
    map[row.key] = { value: row.value, unit: row.unit ?? '' };
  }
  return map;
}

/** 로컬 balance.csv를 [enemies] [difficulty] [stage] 섹션으로 나눈다. */
export function splitSections(text) {
  const sections = {};
  let current = null;
  let buffer = [];

  const flush = () => {
    if (current) sections[current] = buffer.join('\n');
    buffer = [];
  };

  for (const line of text.split(/\r?\n/)) {
    const marker = line.trim().match(/^\[(\w+)\]$/);
    if (marker) {
      flush();
      current = marker[1];
    } else if (current) {
      buffer.push(line);
    }
  }
  flush();

  return sections;
}

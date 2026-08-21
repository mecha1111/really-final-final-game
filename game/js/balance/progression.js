// 이 파일 역할: 구간(스테이지) 자동 상승 공식의 상수만 담는다. 아무것도 import하지 않는다.
//
// 왜 config.js가 아니라 여기인가 — config.js는 balance/rules.js를 재수출하는데,
// rules.js가 이 상수를 쓰려면 config.js를 import해야 해서 순환참조가 된다.
// 그래서 둘 다 참조할 수 있는 잎(leaf) 모듈로 뺐다.
// 바깥에서는 여전히 `config.progression`으로 접근한다(config.js가 이걸 그대로 물고 있다).

/**
 * ★ 구간 인덱스는 첫 구간이 n = 0 이다. 코드·주석·로그 전부 이 규칙으로 통일.
 *   (enemies 시트의 min_stage는 1부터라 해금 판정만 n+1 로 맞춘다 — rules.js)
 *
 * 공식 (rules.js의 createRules가 유일한 구현부):
 *   할당량(MB)   = baseQuota × quotaMult^n
 *   스폰간격(초) = max(baseSpawn ÷ spawnMult^n, minSpawn)   ← 나눗셈이라 n이 크면 빨라진다
 *   동시최대     = min(baseMax + maxAdd×n, maxCap)          ← 정수로 내림
 *   제한시간     = stage 시트의 time_limit 고정(구간과 무관)
 *   dps·수명배율 = difficulty 시트 normal 행 고정(구간과 무관)
 *
 * ★ base* 3개는 "시트 우선, 여기는 폴백"이다:
 *     baseQuota ← stage 시트 quota / baseSpawn·baseMax ← difficulty 시트 normal 행.
 *   "normal이 곧 n=0의 base"라는 규칙을 코드가 literal하게 지키게 하려는 것.
 *   시트에 값이 없을 때만 아래 숫자가 쓰인다. 반면 *Mult/*Cap/min*은 시트에
 *   대응 컬럼이 없어서 여기가 유일한 출처다.
 *
 * ★ 공식을 고치면 이 값을 "읽어서 보여주는 쪽"(ui/screens.js 결과화면,
 *   debug.js 슬라이더)도 같이 확인할 것. 표시부가 옛 공식을 쓰면 "할당량 0" 류 버그가 난다.
 */
export const PROGRESSION = {
  baseQuota: 200,
  quotaMult: 1.2,
  baseSpawn: 1.5,
  spawnMult: 1.08,
  minSpawn: 0.6, // 아무리 구간이 올라도 이보다 빨라지지 않는다(하한 클램프)
  baseMax: 8,
  maxAdd: 1,
  maxCap: 14,
};

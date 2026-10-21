import type { RecipeId } from '../game/recipes';
export function DishArt({ recipe }: { recipe: RecipeId }) {
  return (
    <svg className="dish-art" viewBox="0 0 320 210" aria-hidden="true">
      <ellipse cx="160" cy="177" rx="105" ry="18" fill="#283d2622" />
      <ellipse cx="160" cy="166" rx="113" ry="25" fill="#fbf8ee" />
      <ellipse cx="160" cy="160" rx="96" ry="17" fill="#e6e0d1" />
      {recipe === 'burger' ? (
        <g transform="rotate(-7 160 120)">
          <path d="M77 144Q78 176 158 177Q239 175 243 144Z" fill="#bd722b" />
          <ellipse cx="160" cy="143" rx="84" ry="20" fill="#e6a44c" />
          <path
            d="M76 132Q87 119 101 130L126 122 147 131 172 121 191 130 217 122 243 131 236 146 209 143 187 152 162 142 138 149 112 139 88 145Z"
            fill="#58843a"
          />
          <rect x="78" y="115" width="164" height="24" rx="12" fill="#633b27" />
          <path d="m78 112 157-5-17 21-40-6-32 16-27-20-34 4Z" fill="#ffc849" />
          <ellipse cx="160" cy="104" rx="80" ry="17" fill="#d84d34" />
          <path d="M80 93Q84 39 155 35Q221 32 241 89Q240 107 160 108Q82 108 80 93" fill="#eeb866" />
          <path d="M91 79Q111 42 160 42Q211 40 231 77Q181 58 91 79" fill="#f4c887" />
          {[105, 130, 156, 182, 206].map((x, i) => (
            <ellipse
              key={x}
              cx={x}
              cy={67 + (i % 2) * 15}
              rx="5"
              ry="2"
              transform={`rotate(-25 ${x} 75)`}
              fill="#fff0c7"
            />
          ))}
        </g>
      ) : recipe === 'tacos' ? (
        <g transform="rotate(-10 160 110)">
          <path d="M68 145Q75 49 159 45Q246 52 254 145Z" fill="#cb8735" />
          <path d="m78 134 10-42 23 8 15-27 30 15 25-15 18 26 30-5 17 45Z" fill="#527c34" />
          <g fill="#bc5236">
            <rect x="104" y="90" width="23" height="23" rx="5" transform="rotate(15 115 102)" />
            <rect x="167" y="83" width="22" height="22" rx="5" />
            <rect x="204" y="107" width="19" height="19" rx="4" />
          </g>
          <path
            d="M75 139Q90 81 145 93Q211 106 245 139Q213 175 163 174Q107 177 75 139"
            fill="#f4c66e"
          />
          <g fill="#cf9844">
            <circle cx="107" cy="134" r="3" />
            <circle cx="134" cy="148" r="3" />
            <circle cx="174" cy="127" r="3" />
            <circle cx="199" cy="151" r="3" />
            <circle cx="220" cy="138" r="2" />
          </g>
        </g>
      ) : (
        <g transform="rotate(-6 160 110)">
          <path d="m97 105 116-27 19 78-126 15Z" fill="#704231" />
          <path d="m103 126 116-22 3 12-117 25Z" fill="#d6a58c" />
          <path d="m97 105 43-62 74 35Z" fill="#512f26" />
          <path d="m97 105 43-62 74 35-7 16-30-5-20 20-30-6-22 13Z" fill="#86513b" />
          <path d="M138 54c-20-29 24-39 26-12 4 27-13 32-26 12" fill="#de5349" />
          <path d="m145 33-10-9 15 3 8-10 1 15 13 4-16 2Z" fill="#50783c" />
          <path d="m175 81 16-8 11 12-19 9Z" fill="#efb5a4" />
        </g>
      )}
      <path d="M54 103q-24-23-29 2 24 17 29-2m217-29q22-28 29-3-17 16-29 3" fill="#5e803f" />
    </svg>
  );
}

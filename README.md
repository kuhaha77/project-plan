# React + TypeScript + Vite

이 템플릿은 Vite 환경에서 React를 HMR(핫 모듈 교체)과 기본 ESLint 규칙과 함께 빠르게 시작할 수 있도록 구성된 최소 설정입니다.

현재 공식 플러그인은 다음 두 가지를 사용할 수 있습니다.

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react): [Oxc](https://oxc.rs) 기반
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc): [SWC](https://swc.rs/) 기반

## React Compiler

이 템플릿에서는 개발 및 빌드 성능에 미치는 영향을 고려해 React Compiler를 기본 활성화하지 않습니다.
React Compiler를 적용하려면 [공식 문서](https://react.dev/learn/react-compiler/installation)를 참고하세요.

## ESLint 설정 확장

운영(프로덕션)용 애플리케이션을 개발한다면, 타입 정보를 활용하는 린트 규칙을 활성화하도록 설정을 확장하는 것을 권장합니다.

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // 기타 설정...

      // tseslint.configs.recommended를 제거하고 아래 설정으로 교체
      tseslint.configs.recommendedTypeChecked,
      // 더 엄격한 규칙이 필요하면 아래 설정 사용
      tseslint.configs.strictTypeChecked,
      // 선택적으로 스타일 규칙 추가
      tseslint.configs.stylisticTypeChecked,

      // 기타 설정...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // 기타 옵션...
    },
  },
])
```

React 전용 린트 규칙을 더 강화하려면 [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x)와 [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom)도 함께 설치할 수 있습니다.

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // 기타 설정...
      // React 린트 규칙 활성화
      reactX.configs['recommended-typescript'],
      // React DOM 린트 규칙 활성화
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // 기타 옵션...
    },
  },
])
```

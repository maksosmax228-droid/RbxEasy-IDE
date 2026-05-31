import lessons1 from './lessons_1_200.json';
import lessons2 from './lessons_201_300.json';
import lessons3 from './lessons_301_400.json';
import lessons4 from './lessons_401_500.json';

const rawLessons = [...lessons1, ...lessons2, ...lessons3, ...lessons4];

export const ALL_LESSONS = rawLessons.map(l => ({
  ...l,
  validateRbx: (code: string) => {
    try {
      return eval(l.validateRbx)(code);
    } catch (e) {
      console.error("Validation error (RbxEasy):", e);
      return false;
    }
  },
  validateLuau: (code: string) => {
    try {
      return eval(l.validateLuau)(code);
    } catch (e) {
      console.error("Validation error (Luau):", e);
      return false;
    }
  }
}));

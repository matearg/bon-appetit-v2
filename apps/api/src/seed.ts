import { eq } from 'drizzle-orm';
import { env } from './env.js';
import { createDb } from './db/client.js';
import { listRecipes, lists, recipes, users } from './db/schema.js';
import { hashPassword } from './auth/password.js';

const DEMO_EMAIL = 'demo@bonappetit.local';
const DEMO_PASSWORD = 'demo-password-123';

const demoRecipes = [
  {
    title: 'Weeknight Pasta Pomodoro',
    ingredients: [
      '400 g spaghetti',
      '3 tbsp olive oil',
      '2 garlic cloves',
      '1 can crushed tomatoes',
      'Fresh basil',
      'Salt and pepper',
    ],
    steps: [
      'Boil the pasta in well-salted water.',
      'Fry the sliced garlic in olive oil until golden.',
      'Add the tomatoes and simmer for 10 minutes.',
      'Toss the drained pasta with the sauce and torn basil.',
    ],
    favorite: true,
    weeknight: true,
  },
  {
    title: 'Puré de papas',
    ingredients: ['1 kg potatoes', '50 g butter', '150 ml warm milk', 'Salt', 'Nutmeg (optional)'],
    steps: [
      'Peel and boil the potatoes until soft.',
      'Drain and mash them while still hot.',
      'Stir in the butter and warm milk until smooth.',
      'Season with salt and a pinch of nutmeg.',
    ],
    favorite: true,
    weeknight: false,
  },
  {
    title: 'Lemon Garlic Chicken',
    ingredients: [
      '4 chicken thighs',
      '2 lemons',
      '4 garlic cloves',
      '2 tbsp olive oil',
      'Dried oregano',
    ],
    steps: [
      'Season the chicken with salt, oregano and lemon zest.',
      'Sear the thighs skin-side down for 5 minutes.',
      'Add garlic and lemon juice, then bake at 200 °C for 25 minutes.',
    ],
    favorite: false,
    weeknight: true,
  },
  {
    title: 'Vegetable Fried Rice',
    ingredients: [
      '2 cups cooked rice',
      '2 eggs',
      '1 carrot',
      '1 cup frozen peas',
      '2 tbsp soy sauce',
      '1 tbsp sesame oil',
    ],
    steps: [
      'Scramble the eggs in a hot wok and set aside.',
      'Stir-fry the diced carrot and peas for 3 minutes.',
      'Add the rice and soy sauce, tossing until hot.',
      'Fold the eggs back in and finish with sesame oil.',
    ],
    favorite: false,
    weeknight: true,
  },
  {
    title: 'Banana Bread',
    ingredients: [
      '3 ripe bananas',
      '1/3 cup melted butter',
      '3/4 cup sugar',
      '1 egg',
      '1 1/2 cups flour',
      '1 tsp baking soda',
    ],
    steps: [
      'Mash the bananas and stir in the butter.',
      'Mix in the sugar and egg.',
      'Fold in the flour and baking soda without overmixing.',
      'Bake in a loaf pan at 180 °C for about 60 minutes.',
    ],
    favorite: false,
    weeknight: false,
  },
  {
    title: 'Chocolate Chip Cookies',
    ingredients: [
      '1 cup butter',
      '1 cup brown sugar',
      '2 eggs',
      '2 1/4 cups flour',
      '1 cup chocolate chips',
    ],
    steps: [
      'Cream the butter and sugars together.',
      'Beat in the eggs one at a time.',
      'Stir in the flour and chocolate chips.',
      'Scoop onto trays and bake at 190 °C for 10 minutes.',
    ],
    favorite: false,
    weeknight: false,
  },
];

async function seed(url: string): Promise<void> {
  const { db, close } = createDb(url);
  try {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, DEMO_EMAIL));
    if (existing) {
      console.log('Demo user already exists');
      return;
    }

    const passwordHash = await hashPassword(DEMO_PASSWORD);
    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: DEMO_EMAIL, passwordHash })
        .returning({ id: users.id });

      const [favorites] = await tx
        .insert(lists)
        .values({ userId: user.id, name: 'Favorites', isFavorites: true })
        .returning({ id: lists.id });
      const [weeknight] = await tx
        .insert(lists)
        .values({ userId: user.id, name: 'Weeknight' })
        .returning({ id: lists.id });
      await tx.insert(lists).values({ userId: user.id, name: 'Baking' });

      for (const r of demoRecipes) {
        const [recipe] = await tx
          .insert(recipes)
          .values({ userId: user.id, title: r.title, ingredients: r.ingredients, steps: r.steps })
          .returning({ id: recipes.id });
        const memberships = [
          ...(r.favorite ? [favorites.id] : []),
          ...(r.weeknight ? [weeknight.id] : []),
        ];
        for (const listId of memberships) {
          await tx.insert(listRecipes).values({ listId, recipeId: recipe.id });
        }
      }
    });
    console.log('Seeded demo user');
  } finally {
    await close();
  }
}

// Script entry: `tsx --env-file=.env src/seed.ts`
await seed(env.DATABASE_URL);

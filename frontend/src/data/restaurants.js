export const IS_DEMO_DATA = true;

export const PROMO_OFFERS = {
  WELCOME50: {
    code: 'WELCOME50',
    title: '50% OFF up to ₹100',
    subtitle: 'Valid on orders above ₹249',
    minOrder: 249,
    type: 'percent',
    value: 50,
    maxDiscount: 100,
  },
  ZOMATO75: {
    code: 'ZOMATO75',
    title: 'Flat ₹75 OFF',
    subtitle: 'Valid on orders above ₹399',
    minOrder: 399,
    type: 'flat',
    value: 75,
    maxDiscount: 75,
  },
  FREEDEL: {
    code: 'FREEDEL',
    title: 'Free Delivery',
    subtitle: 'Zero delivery charge above ₹199',
    minOrder: 199,
    type: 'free_delivery',
    value: 0,
    maxDiscount: 50,
  },
};

export const CATEGORIES = [
  {
    id: 'Pizza',
    name: 'Pizza',
    tagline: 'Wood-fired & sourdough',
    image:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'Biryani',
    name: 'Biryani',
    tagline: 'Dum-cooked aromatic rice',
    image:
      'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'Burgers',
    name: 'Burgers',
    tagline: 'Smashed & brioche',
    image:
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'Chinese',
    name: 'Chinese',
    tagline: 'Wok-tossed & dim sum',
    image:
      'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'South Indian',
    name: 'South Indian',
    tagline: 'Coastal spices & appam',
    image:
      'https://images.unsplash.com/photo-1630383249896-424e482df921?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'North Indian',
    name: 'North Indian',
    tagline: 'Tandoor & rich curries',
    image:
      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'Desserts',
    name: 'Desserts',
    tagline: 'Artisanal bakes & tarts',
    image:
      'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'Healthy Food',
    name: 'Healthy Food',
    tagline: 'Grain bowls & cold-press',
    image:
      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80',
  },
];

export const RESTAURANTS = [
  {
    id: 'rest-1',
    slug: 'forno-neapolitan-kitchen',
    name: 'Forno Neapolitan Kitchen',
    cuisine: 'Pizza, Italian, Desserts',
    categories: ['Pizza', 'Desserts'],
    rating: 4.8,
    reviewCount: 1240,
    deliveryFee: 29,
    costForTwo: 750,
    etaRange: '20–28 min',
    etaMinutes: 24,
    city: 'Bengaluru',
    modelCity: 'Metropolitian',
    coordinates: { lat: 12.9716, lng: 77.5946 },
    address: '42 Church Street, Shanthala Nagar, Bengaluru',
    openHours: '11:00 AM – 11:30 PM',
    offer: '50% OFF up to ₹100',
    badge: 'Pro Partner',
    diningOut: true,
    featured: true,
    recommended: true,
    image:
      'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=1000&q=80',
    heroImage:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1400&q=80',
    menu: [
      {
        id: 'm-forno-1',
        name: 'Truffle Burrata Margherita',
        category: 'Wood-Fired Pizzas',
        description:
          '72-hour fermented sourdough crust, San Marzano tomatoes, fresh Pugliese burrata, and basil oil.',
        price: 449,
        rating: 4.8,
        isVeg: true,
        popular: true,
        bestseller: true,
        orderType: 'Meal',
        image:
          'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=700&q=80',
      },
      {
        id: 'm-forno-2',
        name: 'Diavola Pepperoni & Hot Honey',
        category: 'Wood-Fired Pizzas',
        description:
          'Crispy cup pepperoni, fior di latte mozzarella, crushed Calabrian chili, and wildflower hot honey.',
        price: 529,
        rating: 4.7,
        isVeg: false,
        popular: true,
        bestseller: true,
        orderType: 'Meal',
        image:
          'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=700&q=80',
      },
      {
        id: 'm-forno-3',
        name: 'Garlic Rosemary Focaccia Knots',
        category: 'Sides & Starters',
        description:
          'Oven-baked olive oil dough knots tossed in roasted garlic butter and aged Parmigiano.',
        price: 219,
        rating: 4.5,
        isVeg: true,
        popular: false,
        bestseller: false,
        orderType: 'Snack',
        image:
          'https://images.unsplash.com/photo-1573140247632-f8fd74997d5c?auto=format&fit=crop&w=700&q=80',
      },
      {
        id: 'm-forno-4',
        name: 'Classic Espresso Tiramisu',
        category: 'Desserts',
        description:
          'Savoiardi biscuits soaked in single-origin espresso layered with whipped mascarpone.',
        price: 249,
        rating: 4.9,
        isVeg: true,
        popular: false,
        bestseller: true,
        orderType: 'Snack',
        image:
          'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=700&q=80',
      },
    ],
  },
  {
    id: 'rest-2',
    slug: 'smash-craft-burger-co',
    name: 'Smash & Craft Burger Co.',
    cuisine: 'Burgers, American, Shakes',
    categories: ['Burgers'],
    rating: 4.7,
    reviewCount: 980,
    deliveryFee: 0,
    costForTwo: 550,
    etaRange: '15–22 min',
    etaMinutes: 19,
    city: 'Bengaluru',
    modelCity: 'Metropolitian',
    coordinates: { lat: 12.9784, lng: 77.6408 },
    address: '12th Main Road, HAL 2nd Stage, Indiranagar, Bengaluru',
    openHours: '11:30 AM – 1:00 AM',
    offer: 'Free Delivery',
    badge: 'Fastest Near You',
    diningOut: true,
    featured: true,
    recommended: true,
    image:
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1000&q=80',
    heroImage:
      'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1400&q=80',
    menu: [
      {
        id: 'm-smash-1',
        name: 'Double Smash Cheese Burger',
        category: 'Signature Burgers',
        description:
          'Two lacy-edged seared patties, charred sweet onions, double sharp cheddar, and house pickles on toasted brioche.',
        price: 349,
        rating: 4.8,
        isVeg: false,
        popular: true,
        bestseller: true,
        orderType: 'Meal',
        image:
          'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=700&q=80',
      },
      {
        id: 'm-smash-2',
        name: 'Crispy Buttermilk Chicken Burger',
        category: 'Signature Burgers',
        description:
          '24-hour brined crispy chicken fillet, slaw, jalapeño ranch, and dill pickles on a soft potato bun.',
        price: 319,
        rating: 4.6,
        isVeg: false,
        popular: true,
        bestseller: true,
        orderType: 'Meal',
        image:
          'https://images.unsplash.com/photo-1606755962773-d324e0a13086?auto=format&fit=crop&w=700&q=80',
      },
      {
        id: 'm-smash-3',
        name: 'Black Truffle Parmesan Fries',
        category: 'Sides',
        description:
          'Twice-fried skin-on Russet fries with rosemary sea salt, truffle oil, and grated parmesan.',
        price: 179,
        rating: 4.5,
        isVeg: true,
        popular: false,
        bestseller: false,
        orderType: 'Snack',
        image:
          'https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&w=700&q=80',
      },
      {
        id: 'm-smash-4',
        name: 'Salted Caramel Cold Shake',
        category: 'Shakes & Drinks',
        description:
          'Hand-spun Madagascar vanilla bean ice cream blended with burnt caramel and sea salt.',
        price: 189,
        rating: 4.7,
        isVeg: true,
        popular: false,
        bestseller: false,
        orderType: 'Drinks',
        image:
          'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=700&q=80',
      },
    ],
  },
  {
    id: 'rest-3',
    slug: 'saffron-tandoor-house',
    name: 'Saffron & Tandoor House',
    cuisine: 'North Indian, Biryani, Mughlai',
    categories: ['North Indian', 'Biryani'],
    rating: 4.9,
    reviewCount: 2150,
    deliveryFee: 35,
    costForTwo: 800,
    etaRange: '25–34 min',
    etaMinutes: 29,
    city: 'Mumbai',
    modelCity: 'Metropolitian',
    coordinates: { lat: 19.0596, lng: 72.8295 },
    address: 'Pali Hill, Bandra West, Mumbai',
    openHours: '12:00 PM – 11:45 PM',
    offer: 'FLAT ₹75 OFF',
    badge: 'Bestseller',
    diningOut: true,
    featured: true,
    recommended: true,
    image:
      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=1000&q=80',
    heroImage:
      'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=1400&q=80',
    menu: [
      {
        id: 'm-saffron-1',
        name: 'Old Delhi Butter Chicken & Garlic Naan',
        category: 'Signatures',
        description:
          'Charcoal-grilled chicken tikka simmered in velvety smoked tomato-fenugreek gravy, served with two tandoori garlic naans.',
        price: 429,
        rating: 4.9,
        isVeg: false,
        popular: true,
        bestseller: true,
        orderType: 'Meal',
        image:
          'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=700&q=80',
      },
      {
        id: 'm-saffron-2',
        name: 'Hyderabadi Saffron Dum Biryani',
        category: 'Dum Biryani',
        description:
          'Aged basmati rice slow-cooked under pastry seal with caramelized onions, mint, and rosewater.',
        price: 389,
        rating: 4.8,
        isVeg: false,
        popular: true,
        bestseller: true,
        orderType: 'Meal',
        image:
          'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=700&q=80',
      },
      {
        id: 'm-saffron-3',
        name: 'Smoked Paneer Tikka Masala Bowl',
        category: 'Vegetarian Mains',
        description:
          'Clay-oven roasted cottage cheese cubes in spiced makhani sauce with jeera pulao.',
        price: 339,
        rating: 4.7,
        isVeg: true,
        popular: false,
        bestseller: true,
        orderType: 'Meal',
        image:
          'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=700&q=80',
      },
      {
        id: 'm-saffron-4',
        name: 'Royal Mango Lassi',
        category: 'Beverages',
        description:
          'Alphonso mango puree churned with cultured yogurt and crushed green cardamom.',
        price: 149,
        rating: 4.6,
        isVeg: true,
        popular: false,
        bestseller: false,
        orderType: 'Drinks',
        image:
          'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=700&q=80',
      },
    ],
  },
  {
    id: 'rest-4',
    slug: 'verda-kitchen-bowls',
    name: 'Verda Kitchen & Bowls',
    cuisine: 'Healthy Food, Salads, Juices',
    categories: ['Healthy Food'],
    rating: 4.8,
    reviewCount: 740,
    deliveryFee: 19,
    costForTwo: 600,
    etaRange: '16–24 min',
    etaMinutes: 20,
    city: 'Hyderabad',
    modelCity: 'Metropolitian',
    coordinates: { lat: 17.4326, lng: 78.4071 },
    address: 'Road No. 36, Jubilee Hills, Hyderabad',
    openHours: '8:30 AM – 10:30 PM',
    offer: '40% OFF up to ₹80',
    badge: 'Pure Veg Options',
    diningOut: false,
    featured: true,
    recommended: true,
    image:
      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1000&q=80',
    heroImage:
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1400&q=80',
    menu: [
      {
        id: 'm-verda-1',
        name: 'Mediterranean Avocado Quinoa Bowl',
        category: 'Harvest Bowls',
        description:
          'Tri-color quinoa, roasted sweet potato, Hass avocado, spiced chickpeas, baby kale, and lemon-tahini dressing.',
        price: 349,
        rating: 4.8,
        isVeg: true,
        popular: true,
        bestseller: true,
        orderType: 'Meal',
        image:
          'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=700&q=80',
      },
      {
        id: 'm-verda-2',
        name: 'Teriyaki Salmon & Edamame Poke',
        category: 'Protein Bowls',
        description:
          'Pan-seared Atlantic salmon, forbidden black rice, pickled ginger, cucumber ribbons, and sesame.',
        price: 479,
        rating: 4.7,
        isVeg: false,
        popular: true,
        bestseller: false,
        orderType: 'Meal',
        image:
          'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=700&q=80',
      },
      {
        id: 'm-verda-3',
        name: 'Green Matcha & Spinach Cold-Press',
        category: 'Cold-Pressed Juices',
        description:
          'Baby spinach, green apple, cucumber, ginger root, and ceremonial matcha.',
        price: 169,
        rating: 4.5,
        isVeg: true,
        popular: false,
        bestseller: false,
        orderType: 'Drinks',
        image:
          'https://images.unsplash.com/photo-1610970881699-44a5587cabec?auto=format&fit=crop&w=700&q=80',
      },
    ],
  },
  {
    id: 'rest-5',
    slug: 'jade-wok-dim-sum',
    name: 'Jade Wok & Dim Sum',
    cuisine: 'Chinese, Asian, Noodles',
    categories: ['Chinese'],
    rating: 4.6,
    reviewCount: 830,
    deliveryFee: 29,
    costForTwo: 650,
    etaRange: '22–30 min',
    etaMinutes: 26,
    city: 'Bengaluru',
    modelCity: 'Metropolitian',
    coordinates: { lat: 12.9352, lng: 77.6245 },
    address: '80 Feet Road, Koramangala 4th Block, Bengaluru',
    openHours: '12:00 PM – 11:30 PM',
    offer: '20% OFF up to ₹60',
    badge: 'Wok Special',
    diningOut: true,
    featured: false,
    recommended: true,
    image:
      'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=1000&q=80',
    heroImage:
      'https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=1400&q=80',
    menu: [
      {
        id: 'm-jade-1',
        name: 'Chili Oil Crystal Prawn Dumplings',
        category: 'Dim Sum',
        description:
          'Six hand-pleated translucent dumplings bathed in aromatic Sichuan chili crisp and black vinegar.',
        price: 329,
        rating: 4.7,
        isVeg: false,
        popular: true,
        bestseller: true,
        orderType: 'Snack',
        image:
          'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=700&q=80',
      },
      {
        id: 'm-jade-2',
        name: 'Wok-Tossed Dan Dan Noodles',
        category: 'Noodles & Rice',
        description:
          'Hand-pulled wheat noodles with sesame-peanut sauce, pickled mustard greens, and scallions.',
        price: 299,
        rating: 4.6,
        isVeg: true,
        popular: true,
        bestseller: true,
        orderType: 'Meal',
        image:
          'https://images.unsplash.com/photo-1552611052-33e04de081de?auto=format&fit=crop&w=700&q=80',
      },
      {
        id: 'm-jade-3',
        name: 'Crispy Kung Pao Tofu & Cashews',
        category: 'Wok Mains',
        description:
          'Velveted silken tofu wok-seared with bell peppers, roasted cashews, and aged black bean glaze.',
        price: 289,
        rating: 4.5,
        isVeg: true,
        popular: false,
        bestseller: false,
        orderType: 'Meal',
        image:
          'https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=700&q=80',
      },
    ],
  },
  {
    id: 'rest-6',
    slug: 'maison-sucre-patisserie',
    name: 'Maison Sucré Patisserie',
    cuisine: 'Desserts, Bakery, Cakes',
    categories: ['Desserts'],
    rating: 4.9,
    reviewCount: 615,
    deliveryFee: 25,
    costForTwo: 450,
    etaRange: '14–20 min',
    etaMinutes: 17,
    city: 'Pune',
    modelCity: 'Urban',
    coordinates: { lat: 18.5362, lng: 73.8939 },
    address: 'Lane 7, Koregaon Park, Pune',
    openHours: '9:00 AM – 11:00 PM',
    offer: 'FLAT ₹50 OFF',
    badge: 'Under 20 min',
    diningOut: true,
    featured: false,
    recommended: false,
    image:
      'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=1000&q=80',
    heroImage:
      'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=1400&q=80',
    menu: [
      {
        id: 'm-sucre-1',
        name: 'Belgian 70% Dark Chocolate Tart',
        category: 'Tarts & Cakes',
        description:
          'Crisp cocoa sablé shell filled with glossy Valrhona dark chocolate ganache and flaky sea salt.',
        price: 239,
        rating: 4.9,
        isVeg: true,
        popular: true,
        bestseller: true,
        orderType: 'Snack',
        image:
          'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=700&q=80',
      },
      {
        id: 'm-sucre-2',
        name: 'Glazed Brioche Donut Trio',
        category: 'Artisanal Pastries',
        description:
          'Madagascar vanilla glaze, dark chocolate hazelnut, and raspberry pistachio brioche rings.',
        price: 269,
        rating: 4.8,
        isVeg: true,
        popular: true,
        bestseller: false,
        orderType: 'Snack',
        image:
          'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=700&q=80',
      },
      {
        id: 'm-sucre-3',
        name: 'Strawberry Basque Cheesecake Slice',
        category: 'Tarts & Cakes',
        description:
          'Caramelized crust with creamy custard center topped with macerated Mahabaleshwar berries.',
        price: 259,
        rating: 4.8,
        isVeg: true,
        popular: false,
        bestseller: false,
        orderType: 'Snack',
        image:
          'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=700&q=80',
      },
    ],
  },
  {
    id: 'rest-7',
    slug: 'brooklyn-slice-pie',
    name: 'Brooklyn Slice & Pie Co.',
    cuisine: 'Pizza, Burgers, Fast Food',
    categories: ['Pizza', 'Burgers'],
    rating: 4.5,
    reviewCount: 510,
    deliveryFee: 0,
    costForTwo: 500,
    etaRange: '20–29 min',
    etaMinutes: 25,
    city: 'New Delhi',
    modelCity: 'Metropolitian',
    coordinates: { lat: 28.6315, lng: 77.2167 },
    address: 'Block B, Connaught Place, New Delhi',
    openHours: '11:00 AM – 12:30 AM',
    offer: 'Free Delivery',
    badge: 'Value Pick',
    diningOut: false,
    featured: false,
    recommended: false,
    image:
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1000&q=80',
    heroImage:
      'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=1400&q=80',
    menu: [
      {
        id: 'm-bk-1',
        name: '18" Grand Vodka Pesto Pie',
        category: 'Whole Pies',
        description:
          'Foldable NY-style crust topped with creamy tomato vodka sauce, basil pesto swirl, and aged mozzarella.',
        price: 549,
        rating: 4.6,
        isVeg: true,
        popular: true,
        bestseller: true,
        orderType: 'Buffet',
        image:
          'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=700&q=80',
      },
      {
        id: 'm-bk-2',
        name: 'Smoky BBQ Chicken Pizza',
        category: 'Whole Pies',
        description:
          'Charred pulled chicken, red onion rings, smoked gouda, and hickory barbecue drizzle.',
        price: 499,
        rating: 4.5,
        isVeg: false,
        popular: false,
        bestseller: false,
        orderType: 'Meal',
        image:
          'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=700&q=80',
      },
    ],
  },
  {
    id: 'rest-8',
    slug: 'malabar-spice-republic',
    name: 'Malabar Spice Republic',
    cuisine: 'South Indian, Biryani, Coastal',
    categories: ['South Indian', 'Biryani'],
    rating: 4.7,
    reviewCount: 685,
    deliveryFee: 29,
    costForTwo: 600,
    etaRange: '24–32 min',
    etaMinutes: 28,
    city: 'Bengaluru',
    modelCity: 'Metropolitian',
    coordinates: { lat: 12.9719, lng: 77.6412 },
    address: '100 Feet Road, Indiranagar, Bengaluru',
    openHours: '8:00 AM – 11:00 PM',
    offer: '50% OFF up to ₹100',
    badge: 'Local Legend',
    diningOut: true,
    featured: false,
    recommended: true,
    image:
      'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=1000&q=80',
    heroImage:
      'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=1400&q=80',
    menu: [
      {
        id: 'm-mal-1',
        name: 'Ghee Roast Chicken & Malabar Parotta',
        category: 'Coastal Classics',
        description:
          'Slow-roasted spiced chicken tossed in clarified butter and curry leaves with two flaky parottas.',
        price: 379,
        rating: 4.8,
        isVeg: false,
        popular: true,
        bestseller: true,
        orderType: 'Meal',
        image:
          'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=700&q=80',
      },
      {
        id: 'm-mal-2',
        name: 'Appam & Coconut Vegetable Stew',
        category: 'Coastal Classics',
        description:
          'Lacy fermented rice hoppers paired with creamy ginger-coconut milk vegetable stew.',
        price: 269,
        rating: 4.6,
        isVeg: true,
        popular: false,
        bestseller: false,
        orderType: 'Meal',
        image:
          'https://images.unsplash.com/photo-1630383249896-424e482df921?auto=format&fit=crop&w=700&q=80',
      },
    ],
  },
];

export const POPULAR_DISHES = RESTAURANTS.flatMap((restaurant) =>
  restaurant.menu
    .filter((item) => item.popular)
    .map((item) => ({
      ...item,
      restaurantId: restaurant.id,
      restaurantSlug: restaurant.slug,
      restaurantName: restaurant.name,
      restaurant,
    }))
).slice(0, 8);

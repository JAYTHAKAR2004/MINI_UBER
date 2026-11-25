"""City normalization, coordinate validation, and 12-city demo restaurant catalog."""
from __future__ import annotations

import math
import re
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from src.models.db_models import Restaurant

EARTH_RADIUS_KM = 6371.0
MAX_DELIVERY_DISTANCE_KM = 50.0

SUPPORTED_CITIES: List[dict] = [
    {
        "id": "ahmedabad",
        "name": "Ahmedabad",
        "model_city": "Metropolitian",
        "default_address": "Sindhu Bhavan Road, Bodakdev, Ahmedabad 380054",
        "restaurant_lat": 23.0300,
        "restaurant_lon": 72.5176,
        "delivery_lat": 23.0395,
        "delivery_lon": 72.5310,
        "aliases": ["ahmedabad", "amdavad"],
        "areas": [
            ("Navrangpura", 23.0365, 72.5611),
            ("CG Road", 23.0276, 72.5582),
            ("Prahlad Nagar", 23.0120, 72.5105),
            ("Bodakdev", 23.0395, 72.5094),
            ("Satellite", 23.0262, 72.5236),
            ("Vastrapur", 23.0372, 72.5300),
            ("Thaltej", 23.0504, 72.4991),
            ("Maninagar", 22.9962, 72.6033),
            ("Bopal", 23.0338, 72.4633),
            ("SG Highway", 23.0468, 72.5284),
        ],
    },
    {
        "id": "bengaluru",
        "name": "Bengaluru",
        "model_city": "Metropolitian",
        "default_address": "100 Feet Road, Indiranagar, Bengaluru 560038",
        "restaurant_lat": 12.9716,
        "restaurant_lon": 77.5946,
        "delivery_lat": 12.9855,
        "delivery_lon": 77.6412,
        "aliases": ["bengaluru", "bangalore", "bengaluru urban"],
        "areas": [
            ("Church Street", 12.9752, 77.6046),
            ("Indiranagar", 12.9784, 77.6408),
            ("Koramangala", 12.9352, 77.6245),
            ("Jayanagar", 12.9299, 77.5838),
            ("Malleshwaram", 13.0055, 77.5692),
            ("HSR Layout", 12.9121, 77.6446),
            ("Whitefield", 12.9698, 77.7500),
            ("MG Road", 12.9756, 77.6066),
            ("Basavanagudi", 12.9406, 77.5738),
            ("Sadashivanagar", 13.0068, 77.5813),
        ],
    },
    {
        "id": "mumbai",
        "name": "Mumbai",
        "model_city": "Metropolitian",
        "default_address": "Hill Road, Bandra West, Mumbai 400050",
        "restaurant_lat": 19.0596,
        "restaurant_lon": 72.8295,
        "delivery_lat": 19.0821,
        "delivery_lon": 72.8411,
        "aliases": ["mumbai", "bombay", "navi mumbai"],
        "areas": [
            ("Bandra West", 19.0596, 72.8295),
            ("Lower Parel", 18.9982, 72.8270),
            ("Andheri West", 19.1364, 72.8296),
            ("Juhu", 19.1075, 72.8263),
            ("Powai", 19.1176, 72.9060),
            ("Colaba", 18.9067, 72.8147),
            ("Dadar", 19.0178, 72.8478),
            ("Worli", 19.0176, 72.8162),
            ("Fort", 18.9322, 72.8328),
            ("Malad West", 19.1874, 72.8423),
        ],
    },
    {
        "id": "delhi",
        "name": "Delhi",
        "model_city": "Metropolitian",
        "default_address": "Block B, Connaught Place, Delhi 110001",
        "restaurant_lat": 28.6315,
        "restaurant_lon": 77.2167,
        "delivery_lat": 28.6442,
        "delivery_lon": 77.2273,
        "aliases": ["delhi", "new delhi", "delhi ncr", "ncr"],
        "areas": [
            ("Connaught Place", 28.6315, 77.2167),
            ("Khan Market", 28.6001, 77.2270),
            ("Hauz Khas", 28.5494, 77.2001),
            ("Saket", 28.5245, 77.2066),
            ("Rajouri Garden", 28.6423, 77.1202),
            ("Karol Bagh", 28.6514, 77.1907),
            ("Lajpat Nagar", 28.5677, 77.2433),
            ("Dwarka", 28.5921, 77.0460),
            ("Greater Kailash", 28.5482, 77.2392),
            ("Vasant Kunj", 28.5293, 77.1526),
        ],
    },
    {
        "id": "hyderabad",
        "name": "Hyderabad",
        "model_city": "Metropolitian",
        "default_address": "Road No. 36, Jubilee Hills, Hyderabad 500033",
        "restaurant_lat": 17.4326,
        "restaurant_lon": 78.4071,
        "delivery_lat": 17.4486,
        "delivery_lon": 78.3908,
        "aliases": ["hyderabad", "secunderabad"],
        "areas": [
            ("Jubilee Hills", 17.4326, 78.4071),
            ("Banjara Hills", 17.4156, 78.4347),
            ("Madhapur", 17.4486, 78.3908),
            ("Gachibowli", 17.4401, 78.3489),
            ("Kondapur", 17.4622, 78.3568),
            ("Begumpet", 17.4447, 78.4664),
            ("Charminar", 17.3616, 78.4747),
            ("Somajiguda", 17.4239, 78.4583),
            ("Kukatpally", 17.4948, 78.3996),
            ("Himayatnagar", 17.4018, 78.4810),
        ],
    },
    {
        "id": "pune",
        "name": "Pune",
        "model_city": "Metropolitian",
        "default_address": "Lane 7, Koregaon Park, Pune 411001",
        "restaurant_lat": 18.5362,
        "restaurant_lon": 73.8939,
        "delivery_lat": 18.5526,
        "delivery_lon": 73.9043,
        "aliases": ["pune", "poona"],
        "areas": [
            ("Koregaon Park", 18.5362, 73.8939),
            ("Kalyani Nagar", 18.5463, 73.9033),
            ("Baner", 18.5590, 73.7868),
            ("Viman Nagar", 18.5679, 73.9143),
            ("Kothrud", 18.5074, 73.8077),
            ("Shivajinagar", 18.5308, 73.8475),
            ("FC Road", 18.5226, 73.8415),
            ("Aundh", 18.5580, 73.8075),
            ("Hinjewadi", 18.5913, 73.7389),
            ("Camp", 18.5137, 73.8789),
        ],
    },
    {
        "id": "chennai",
        "name": "Chennai",
        "model_city": "Metropolitian",
        "default_address": "Khader Nawaz Khan Road, Nungambakkam, Chennai 600006",
        "restaurant_lat": 13.0604,
        "restaurant_lon": 80.2496,
        "delivery_lat": 13.0475,
        "delivery_lon": 80.2580,
        "aliases": ["chennai", "madras"],
        "areas": [
            ("Nungambakkam", 13.0604, 80.2496),
            ("T Nagar", 13.0418, 80.2341),
            ("Adyar", 13.0012, 80.2565),
            ("Besant Nagar", 13.0003, 80.2667),
            ("Anna Nagar", 13.0850, 80.2101),
            ("Alwarpet", 13.0335, 80.2535),
            ("Mylapore", 13.0368, 80.2676),
            ("Velachery", 12.9815, 80.2180),
            ("Egmore", 13.0732, 80.2609),
            ("Guindy", 13.0067, 80.2206),
        ],
    },
    {
        "id": "kolkata",
        "name": "Kolkata",
        "model_city": "Metropolitian",
        "default_address": "Park Street, Taltala, Kolkata 700016",
        "restaurant_lat": 22.5535,
        "restaurant_lon": 88.3532,
        "delivery_lat": 22.5620,
        "delivery_lon": 88.3650,
        "aliases": ["kolkata", "calcutta"],
        "areas": [
            ("Park Street", 22.5535, 88.3532),
            ("Salt Lake", 22.5867, 88.4171),
            ("Ballygunge", 22.5280, 88.3659),
            ("New Town", 22.5754, 88.4795),
            ("Gariahat", 22.5176, 88.3655),
            ("Bhawanipur", 22.5326, 88.3452),
            ("Esplanade", 22.5649, 88.3516),
            ("Jadavpur", 22.4989, 88.3717),
            ("Alipore", 22.5334, 88.3292),
            ("Lake Town", 22.6079, 88.4041),
        ],
    },
    {
        "id": "jaipur",
        "name": "Jaipur",
        "model_city": "Urban",
        "default_address": "MI Road, C-Scheme, Jaipur 302001",
        "restaurant_lat": 26.9124,
        "restaurant_lon": 75.7873,
        "delivery_lat": 26.9025,
        "delivery_lon": 75.8020,
        "aliases": ["jaipur"],
        "areas": [
            ("C-Scheme", 26.9062, 75.7995),
            ("Malviya Nagar", 26.8549, 75.8243),
            ("Vaishali Nagar", 26.9124, 75.7439),
            ("MI Road", 26.9165, 75.8068),
            ("Raja Park", 26.8995, 75.8278),
            ("Mansarovar", 26.8686, 75.7623),
            ("Bani Park", 26.9255, 75.7931),
            ("Tonk Road", 26.8768, 75.8065),
            ("Civil Lines", 26.9056, 75.7805),
            ("Jagatpura", 26.8279, 75.8648),
        ],
    },
    {
        "id": "gandhinagar",
        "name": "Gandhinagar",
        "model_city": "Urban",
        "default_address": "GH-4 Circle, Sector 11, Gandhinagar 382011",
        "restaurant_lat": 23.2156,
        "restaurant_lon": 72.6369,
        "delivery_lat": 23.2245,
        "delivery_lon": 72.6480,
        "aliases": ["gandhinagar"],
        "areas": [
            ("Sector 11", 23.2230, 72.6442),
            ("Sector 21", 23.2356, 72.6512),
            ("Kudasan", 23.1869, 72.6285),
            ("Sargasan", 23.1942, 72.6203),
            ("Infocity", 23.1924, 72.6334),
            ("Sector 7", 23.2165, 72.6350),
            ("Sector 16", 23.2289, 72.6389),
            ("Randesan", 23.1782, 72.6481),
            ("Pethapur", 23.2625, 72.6621),
            ("GIFT City Road", 23.1636, 72.6815),
        ],
    },
    {
        "id": "surat",
        "name": "Surat",
        "model_city": "Urban",
        "default_address": "Gaurav Path, Piplod, Surat 395007",
        "restaurant_lat": 21.1591,
        "restaurant_lon": 72.7758,
        "delivery_lat": 21.1702,
        "delivery_lon": 72.7911,
        "aliases": ["surat"],
        "areas": [
            ("Piplod", 21.1591, 72.7758),
            ("Vesu", 21.1418, 72.7709),
            ("Adajan", 21.1959, 72.7933),
            ("Athwa Lines", 21.1795, 72.8045),
            ("City Light", 21.1642, 72.7972),
            ("Pal", 21.1897, 72.7782),
            ("Ghod Dod Road", 21.1743, 72.8075),
            ("Varachha", 21.2116, 72.8634),
            ("Katargam", 21.2266, 72.8312),
            ("Dumas Road", 21.1465, 72.7574),
        ],
    },
    {
        "id": "vadodara",
        "name": "Vadodara",
        "model_city": "Urban",
        "default_address": "RC Dutt Road, Alkapuri, Vadodara 390007",
        "restaurant_lat": 22.3119,
        "restaurant_lon": 73.1723,
        "delivery_lat": 22.3072,
        "delivery_lon": 73.1812,
        "aliases": ["vadodara", "baroda"],
        "areas": [
            ("Alkapuri", 22.3119, 73.1723),
            ("Fatehgunj", 22.3196, 73.1869),
            ("Akota", 22.2951, 73.1684),
            ("Gotri", 22.3145, 73.1370),
            ("Manjalpur", 22.2683, 73.1886),
            ("Sayajigunj", 22.3095, 73.1852),
            ("Karelibaug", 22.3238, 73.1995),
            ("Vasna Bhayli", 22.2932, 73.1338),
            ("Sama", 22.3402, 73.1954),
            ("Nizampura", 22.3264, 73.1798),
        ],
    },
]

_ALIAS_TO_CITY: Dict[str, dict] = {}
for _city_spec in SUPPORTED_CITIES:
    _ALIAS_TO_CITY[_city_spec["id"]] = _city_spec
    _ALIAS_TO_CITY[_city_spec["name"].lower()] = _city_spec
    for _alias in _city_spec["aliases"]:
        _ALIAS_TO_CITY[_alias.lower()] = _city_spec

# 10 cuisine archetypes guaranteed in every supported city.
CUISINE_ARCHETYPES: List[dict] = [
    {
        "suffix": "Spice Courtyard (Demo)",
        "cuisine": "Indian, North Indian",
        "categories": ["Indian", "North Indian", "Healthy Food"],
        "is_pure_veg": True,
        "rating": 4.5,
        "review_count": 640,
        "delivery_fee": 25,
        "cost_for_two": 550,
        "avg_prep_time": 24,
        "offer": "20% OFF up to ₹80",
        "dining_out": True,
        "image": "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=1000&q=80",
        "hero": "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=1400&q=80",
        "dishes": [
            ("Paneer Lababdar Bowl", "Main Course", "Slow-simmered cottage cheese in spiced tomato-cashew gravy with jeera rice.", 299, True, True, "Meal", "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=700&q=80"),
            ("Dal Makhani & Garlic Naan", "Main Course", "24-hour black lentils finished with white butter and tandoori naan.", 329, True, True, "Meal", "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=700&q=80"),
            ("Tandoori Stuffed Mushroom", "Starters", "Charcoal-roasted button mushrooms marinated in hung curd and ajwain.", 239, True, False, "Snack", "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=700&q=80"),
            ("Masala Chaas Flask", "Beverages", "Chilled spiced buttermilk tempered with roasted cumin and mint.", 99, True, False, "Drinks", "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=700&q=80"),
        ],
    },
    {
        "suffix": "Gujarati Rasoi (Demo)",
        "cuisine": "Gujarati, Indian",
        "categories": ["Gujarati", "Indian", "Healthy Food"],
        "is_pure_veg": True,
        "rating": 4.6,
        "review_count": 780,
        "delivery_fee": 0,
        "cost_for_two": 480,
        "avg_prep_time": 21,
        "offer": "Free Delivery on ₹199+",
        "dining_out": True,
        "image": "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=1000&q=80",
        "hero": "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=1400&q=80",
        "dishes": [
            ("Royal Kathiyawadi Thali", "Thali", "Phulkas, sev tameta, dal-bhat, farsan, kadhi, and jaggery-ghee churma.", 289, True, True, "Meal", "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=700&q=80"),
            ("Khaman Dhokla & Fafda Box", "Snacks", "Steamed gram-flour dhokla with green chili chutney and papaya sambharo.", 179, True, True, "Snack", "https://images.unsplash.com/photo-1606491956689-2ea866880c84?auto=format&fit=crop&w=700&q=80"),
            ("Undhiyu & Puri Meal", "Main Course", "Winter-spiced surti undhiyu served with crisp wheat puris and shrikhand.", 319, True, False, "Meal", "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=700&q=80"),
            ("Kesar Pista Shrikhand", "Desserts", "Velvety strained yogurt dessert infused with saffron and pistachio.", 149, True, False, "Snack", "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=700&q=80"),
        ],
    },
    {
        "suffix": "Punjabi Tandoor House (Demo)",
        "cuisine": "Punjabi, North Indian",
        "categories": ["Punjabi", "North Indian", "Indian"],
        "is_pure_veg": False,
        "rating": 4.7,
        "review_count": 910,
        "delivery_fee": 29,
        "cost_for_two": 700,
        "avg_prep_time": 25,
        "offer": "50% OFF up to ₹100",
        "dining_out": True,
        "image": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=1000&q=80",
        "hero": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=1400&q=80",
        "dishes": [
            ("Amritsari Chole & Kulcha", "Recommended", "Aloo-paneer stuffed tandoori kulcha with tangy Amritsari pindi chole.", 269, True, True, "Meal", "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=700&q=80"),
            ("Smoked Butter Chicken", "Main Course", "Char-grilled chicken tikka simmered in silky makhani gravy.", 399, False, True, "Meal", "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=700&q=80"),
            ("Tandoori Paneer Tikka", "Starters", "Charred cottage cheese skewers with mint-coriander dip.", 289, True, False, "Snack", "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=700&q=80"),
            ("Patiala Sweet Lassi", "Beverages", "Thick churned curd topped with malai and cardamom.", 129, True, False, "Drinks", "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=700&q=80"),
        ],
    },
    {
        "suffix": "Dakshin Dosa Cafe (Demo)",
        "cuisine": "South Indian, Indian",
        "categories": ["South Indian", "Indian", "Cafes"],
        "is_pure_veg": True,
        "rating": 4.6,
        "review_count": 850,
        "delivery_fee": 19,
        "cost_for_two": 400,
        "avg_prep_time": 18,
        "offer": "Flat ₹50 OFF",
        "dining_out": True,
        "image": "https://images.unsplash.com/photo-1630383249896-424e482df921?auto=format&fit=crop&w=1000&q=80",
        "hero": "https://images.unsplash.com/photo-1630383249896-424e482df921?auto=format&fit=crop&w=1400&q=80",
        "dishes": [
            ("Ghee Podi Masala Dosa", "Dosas", "Crisp fermented crepe brushed with roasted lentil podi and spiced potato.", 179, True, True, "Meal", "https://images.unsplash.com/photo-1630383249896-424e482df921?auto=format&fit=crop&w=700&q=80"),
            ("Mini Idli & Medu Vada Trio", "Breakfast", "Steamed fluffy idlis and crispy lentil vadas with piping hot sambar.", 159, True, True, "Meal", "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=700&q=80"),
            ("Bisi Bele Bath Bowl", "Rice Bowls", "Tamarind-spiced Karnataka lentil rice topped with cashew boondi.", 209, True, False, "Meal", "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=700&q=80"),
            ("Filter Kaapi Flask (250ml)", "Beverages", "Traditional South Indian chicory-roast coffee decoction with frothed milk.", 119, True, False, "Drinks", "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=700&q=80"),
        ],
    },
    {
        "suffix": "Wok & Dimsum Studio (Demo)",
        "cuisine": "Chinese, Asian",
        "categories": ["Chinese"],
        "is_pure_veg": False,
        "rating": 4.4,
        "review_count": 560,
        "delivery_fee": 29,
        "cost_for_two": 620,
        "avg_prep_time": 23,
        "offer": "30% OFF up to ₹75",
        "dining_out": True,
        "image": "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=1000&q=80",
        "hero": "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=1400&q=80",
        "dishes": [
            ("Burnt Garlic Hakka Noodles", "Noodles", "Wok-tossed noodles with crisp bok choy, peppers, and toasted garlic.", 249, True, True, "Meal", "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=700&q=80"),
            ("Crispy Chili Paneer Dry", "Starters", "Lightly battered cottage cheese tossed in soy-chili glaze.", 269, True, True, "Snack", "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=700&q=80"),
            ("Schezwan Chicken Fried Rice", "Rice", "Fiery house-made Schezwan tossed jasmine rice with roast chicken.", 289, False, False, "Meal", "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=700&q=80"),
            ("Steamed Crystal Veg Dimsum", "Dimsum", "Translucent dumplings stuffed with water chestnut, shitake, and chives.", 259, True, False, "Snack", "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=700&q=80"),
        ],
    },
    {
        "suffix": "Forno Woodfire Bistro (Demo)",
        "cuisine": "Italian, Pizza, Pasta",
        "categories": ["Italian", "Pizza"],
        "is_pure_veg": False,
        "rating": 4.8,
        "review_count": 1020,
        "delivery_fee": 35,
        "cost_for_two": 850,
        "avg_prep_time": 26,
        "offer": "Flat ₹75 OFF",
        "dining_out": True,
        "image": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=1000&q=80",
        "hero": "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1400&q=80",
        "dishes": [
            ("Neapolitan Burrata Margherita", "Pizza", "Wood-fired sourdough base with San Marzano sauce, burrata, and basil.", 449, True, True, "Meal", "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=700&q=80"),
            ("Truffle Mushroom Penne Alfredo", "Pasta", "Creamy roasted mushroom and parmesan penne finished with truffle oil.", 389, True, True, "Meal", "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=700&q=80"),
            ("Garlic Rosemary Focaccia", "Sides", "Warm sea-salt olive oil focaccia with herb butter.", 199, True, False, "Snack", "https://images.unsplash.com/photo-1573140247632-f8fd74997d5c?auto=format&fit=crop&w=700&q=80"),
            ("Classic Espresso Tiramisu", "Desserts", "Mascarpone mousse layered over espresso-soaked savoiardi.", 249, True, False, "Snack", "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=700&q=80"),
        ],
    },
    {
        "suffix": "Smash Burger & Wraps (Demo)",
        "cuisine": "Fast Food, Burgers, Rolls",
        "categories": ["Fast Food", "Burgers", "Rolls"],
        "is_pure_veg": False,
        "rating": 4.5,
        "review_count": 720,
        "delivery_fee": 0,
        "cost_for_two": 450,
        "avg_prep_time": 17,
        "offer": "Free Delivery",
        "dining_out": False,
        "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1000&q=80",
        "hero": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1400&q=80",
        "dishes": [
            ("Double Cheddar Smash Burger", "Burgers", "Crispy seared double patty, aged cheddar, pickles, and smoky sauce.", 279, False, True, "Meal", "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=700&q=80"),
            ("Crispy Peri-Peri Paneer Burger", "Burgers", "Crunchy spiced cottage cheese fillet with chipotle slaw.", 229, True, True, "Meal", "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=700&q=80"),
            ("Loaded Peri-Peri Fries", "Fast Food", "Crisp skin-on fries drizzled with aged cheese sauce and jalapenos.", 159, True, False, "Snack", "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=700&q=80"),
            ("Malabar Kathi Paneer Roll", "Rolls", "Flaky parotta wrapped around smoky paneer tikka and mint mayo.", 199, True, False, "Snack", "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=700&q=80"),
        ],
    },
    {
        "suffix": "Dum Biryani Handi (Demo)",
        "cuisine": "Biryani, Mughlai, Indian",
        "categories": ["Biryani", "Indian", "North Indian"],
        "is_pure_veg": False,
        "rating": 4.7,
        "review_count": 1150,
        "delivery_fee": 25,
        "cost_for_two": 650,
        "avg_prep_time": 27,
        "offer": "50% OFF up to ₹100",
        "dining_out": True,
        "image": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=1000&q=80",
        "hero": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=1400&q=80",
        "dishes": [
            ("Hyderabadi Chicken Dum Biryani", "Biryani", "Long-grain saffron basmati sealed over charcoal with succulent spiced chicken.", 349, False, True, "Meal", "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=700&q=80"),
            ("Subz Zafrani Handi Biryani", "Biryani", "Aromatic vegetable & paneer dum biryani with mirchi ka salan and raita.", 299, True, True, "Meal", "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=700&q=80"),
            ("Galouti Kebab Platter", "Kebabs", "Melt-in-mouth smoked spiced kebabs served on mini saffron parathas.", 319, False, False, "Snack", "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=700&q=80"),
            ("Shahi Double Ka Meetha", "Desserts", "Saffron-soaked brioche pudding studded with toasted almonds.", 159, True, False, "Snack", "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=700&q=80"),
        ],
    },
    {
        "suffix": "Velvet Gelato & Patisserie (Demo)",
        "cuisine": "Desserts, Cakes, Bakery",
        "categories": ["Desserts", "Cakes"],
        "is_pure_veg": True,
        "rating": 4.9,
        "review_count": 690,
        "delivery_fee": 19,
        "cost_for_two": 450,
        "avg_prep_time": 16,
        "offer": "20% OFF on Cakes",
        "dining_out": True,
        "image": "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=1000&q=80",
        "hero": "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1400&q=80",
        "dishes": [
            ("Belgian Dark Chocolate Truffle Slice", "Cakes", "Rich 70% dark chocolate ganache layered over moist cocoa sponge.", 239, True, True, "Snack", "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=700&q=80"),
            ("Lotus Biscoff Baked Cheesecake", "Desserts", "Creamy Philadelphia-style cheesecake topped with caramelized Biscoff spread.", 279, True, True, "Snack", "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=700&q=80"),
            ("Salted Caramel Gelato Tub (300ml)", "Desserts", "Slow-churned artisanal gelato swirled with sea-salt caramel ribbon.", 299, True, False, "Snack", "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=700&q=80"),
            ("Warm Walnut Fudge Brownie", "Bakery", "Gooey dark chocolate brownie folded with roasted Kashmiri walnuts.", 169, True, False, "Snack", "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=700&q=80"),
        ],
    },
    {
        "suffix": "Roast & Crumb Coffee Bar (Demo)",
        "cuisine": "Cafes, Beverages, Healthy Food",
        "categories": ["Cafes", "Healthy Food", "Desserts"],
        "is_pure_veg": True,
        "rating": 4.6,
        "review_count": 530,
        "delivery_fee": 0,
        "cost_for_two": 520,
        "avg_prep_time": 19,
        "offer": "Free Cold Brew Upgrade",
        "dining_out": True,
        "image": "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1000&q=80",
        "hero": "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1400&q=80",
        "dishes": [
            ("Single-Origin Iced Vietnamese Brew", "Coffee", "Slow-dripped Chikmagalur Arabica over condensed milk and ice.", 199, True, True, "Drinks", "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=700&q=80"),
            ("Avocado Sourdough Tartine", "Healthy Food", "Toasted multigrain sourdough topped with smashed avocado, feta, and dukkah.", 319, True, True, "Meal", "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=700&q=80"),
            ("Butter Almond Croissant", "Bakery", "Flaky laminated pastry filled with toasted almond frangipane.", 189, True, False, "Snack", "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=700&q=80"),
            ("Quinoa & Roasted Pepper Bowl", "Healthy Food", "Warm herb quinoa tossed with charred peppers, chickpeas, and lemon tahini.", 299, True, False, "Meal", "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=700&q=80"),
        ],
    },
]


def get_city_spec(raw: Optional[str]) -> Optional[dict]:
    """Return canonical city definition if raw city matches any supported city or alias."""
    cleaned = re.sub(r"\s+", " ", (raw or "").strip()).lower()
    if not cleaned:
        return None
    if cleaned in _ALIAS_TO_CITY:
        return _ALIAS_TO_CITY[cleaned]
    for alias, spec in _ALIAS_TO_CITY.items():
        if len(alias) >= 4 and re.search(rf"\b{re.escape(alias)}\b", cleaned):
            return spec
    return None


def normalize_city_name(raw: Optional[str]) -> Optional[str]:
    """Normalize a city string to canonical capitalization or trimmed text if unknown."""
    cleaned = re.sub(r"\s+", " ", (raw or "").strip())
    if not cleaned:
        return None
    spec = get_city_spec(cleaned)
    return spec["name"] if spec else cleaned


def normalize_city_slug(raw: Optional[str]) -> str:
    """Normalize a city string into a canonical lowercase identifier for DB matching."""
    cleaned = re.sub(r"\s+", " ", (raw or "").strip()).lower()
    if not cleaned:
        return ""
    spec = get_city_spec(cleaned)
    return spec["id"] if spec else cleaned


def detect_city_in_text(text: Optional[str]) -> Optional[str]:
    """Return canonical city name if a supported city or alias appears in free-form address text."""
    cleaned = re.sub(r"\s+", " ", (text or "").strip()).lower()
    if not cleaned:
        return None
    for alias, spec in sorted(_ALIAS_TO_CITY.items(), key=lambda kv: -len(kv[0])):
        if re.search(rf"\b{re.escape(alias)}\b", cleaned):
            return spec["name"]
    return None


def are_india_coordinates_valid(lat: Optional[float], lon: Optional[float]) -> bool:
    """Validate latitude/longitude within India bounds matching src/pipeline/etl.py."""
    if lat is None or lon is None:
        return False
    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (TypeError, ValueError):
        return False
    if not (math.isfinite(lat_f) and math.isfinite(lon_f)):
        return False
    return 6.0 <= lat_f <= 38.0 and 68.0 <= lon_f <= 98.0


def calculate_haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute Haversine distance in kilometers matching src/pipeline/etl.py."""
    rlat1, rlon1, rlat2, rlon2 = map(math.radians, [float(lat1), float(lon1), float(lat2), float(lon2)])
    dlat = rlat2 - rlat1
    dlon = rlon2 - rlon1
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
    return round(2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a)), 2)


def build_demo_restaurant_catalog() -> List[dict]:
    """Generate 10 clearly marked demo restaurants for each of the 12 supported cities (120 total)."""
    records: List[dict] = []
    for city_spec in SUPPORTED_CITIES:
        city_id = city_spec["id"]
        city_name = city_spec["name"]
        model_city = city_spec["model_city"]

        for idx, (archetype, area_info) in enumerate(zip(CUISINE_ARCHETYPES, city_spec["areas"]), start=1):
            area_name, lat, lon = area_info
            restaurant_key = f"{city_id}-demo-{idx:02d}"
            slug_base = re.sub(r"[^a-z0-9]+", "-", f"{area_name}-{archetype['suffix']}".lower()).strip("-")
            slug = f"{city_id}-{slug_base}"
            name = f"{area_name} {archetype['suffix']}"
            prep_time = archetype["avg_prep_time"]

            menu = []
            for m_idx, dish in enumerate(archetype["dishes"], start=1):
                d_name, d_cat, d_desc, d_price, d_veg, d_pop, d_type, d_img = dish
                menu.append(
                    {
                        "id": f"{restaurant_key}-m{m_idx}",
                        "name": d_name,
                        "category": d_cat,
                        "description": d_desc,
                        "price": d_price,
                        "rating": round(min(4.9, archetype["rating"] + (0.1 if d_pop else 0.0)), 1),
                        "isVeg": d_veg,
                        "popular": d_pop,
                        "bestseller": d_pop,
                        "orderType": d_type,
                        "image": d_img,
                    }
                )

            records.append(
                {
                    "restaurant_key": restaurant_key,
                    "slug": slug,
                    "name": name,
                    "city": city_name,
                    "city_normalized": city_id,
                    "model_city": model_city,
                    "area": area_name,
                    "address": f"{10 + idx * 7}, {area_name} Main Road, {city_name}",
                    "latitude": round(lat, 6),
                    "longitude": round(lon, 6),
                    "cuisine": archetype["cuisine"],
                    "categories": archetype["categories"],
                    "rating": archetype["rating"],
                    "review_count": archetype["review_count"],
                    "delivery_available": True,
                    "avg_prep_time_minutes": prep_time,
                    "delivery_fee": archetype["delivery_fee"],
                    "cost_for_two": archetype["cost_for_two"],
                    "is_pure_veg": archetype["is_pure_veg"],
                    "dining_out": archetype["dining_out"],
                    "offer": archetype["offer"],
                    "open_hours": "10:30 AM – 11:30 PM",
                    "image": archetype["image"],
                    "hero_image": archetype["hero"],
                    "gallery": [archetype["hero"], archetype["image"], archetype["dishes"][0][7]],
                    "menu": menu,
                    "is_demo": True,
                }
            )
    return records


def seed_restaurants(db: Session) -> int:
    """Idempotently seed any missing demo restaurants across all 12 supported cities."""
    existing_keys = {row[0] for row in db.query(Restaurant.restaurant_key).all()}
    catalog = build_demo_restaurant_catalog()
    inserted = 0
    for item in catalog:
        if item["restaurant_key"] in existing_keys:
            continue
        db.add(Restaurant(**item))
        inserted += 1
    if inserted > 0:
        db.commit()
    return inserted


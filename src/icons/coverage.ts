import { icons } from './catalog.ts';

export type IconIndustry = {
  id: string;
  label: string;
  /** Names and aliases used by the hosted Vitris template catalog. */
  terms: readonly string[];
  categories: readonly string[];
  extras: readonly string[];
};
const group = (id: string, label: string, terms: string[], categories: string[], extras: string[] = []): IconIndustry => Object.freeze({ id, label, terms: Object.freeze(terms), categories: Object.freeze(categories), extras: Object.freeze(extras) });

export const iconIndustries: readonly IconIndustry[] = Object.freeze([
  group('electrical', 'Electrical & solar', ['Electrical','Electricians','Solar','EV charging'], ['Electrical'], ['bolt','shield-check','multimeter']),
  group('plumbing', 'Plumbing & drainage', ['Plumbing','Plumbing and integrated home services'], ['Plumbing'], ['pipe','droplet','wrench']),
  group('hvac', 'HVAC & heating', ['HVAC','Heating','Ventilation'], ['HVAC'], ['thermometer','snowflake','flame']),
  group('roofing', 'Roofing & exteriors', ['Roofing','Roofing & exteriors'], ['Roofing'], ['roof','house','shield-check']),
  group('construction', 'Construction & remodeling', ['Construction','General contractors','Residential building','Home services','Home improvement','Remodeling'], ['Construction','Trades'], ['house','ruler','blueprint']),
  group('earthwork', 'Excavation & civil construction', ['Civil construction','Earthmoving','Excavating / Earthwork','Excavation'], ['Excavation'], ['hard-hat','crane']),
  group('cleaning', 'Cleaning & housekeeping', ['Cleaning','Home cleaning','Home cleaning services','Holiday let cleaning','Residential cleaning'], ['Cleaning'], ['sparkles','house','shield-check']),
  group('landscaping', 'Landscaping & tree services', ['Landscaping','Tree services'], ['Landscaping'], ['leaf','tree','flower','seedling']),
  group('property', 'Real estate & property', ['Real estate','Property management'], ['Real estate'], ['house','building','key','map-pin']),
  group('legal', 'Law firms & legal services', ['Law firms','Legal','Attorneys'], ['Legal'], ['briefcase','document','shield-check']),
  group('medical', 'Medical & women’s health', ["Doctor's offices",'Medical','OB-GYN','Women’s health','Dental','Healthcare'], ['Healthcare','Health'], ['calendar','user','heart']),
  group('care', 'Home care & senior living', ['Care homes','Home care','Senior living','Nursing'], ['Care services'], ['heart','accessibility','shield-check']),
  group('beauty', 'Barber shops & salons', ['Barber','Barber & grooming','Barber shops','Barbershop','Hair & grooming','Salon','Beauty'], ['Beauty'], ['scissors','calendar','user']),
  group('wellness', 'Spa, massage & wellness', ['Massage & wellness','Spa','Wellness'], ['Wellness'], ['spa','leaf','heart']),
  group('repair', 'Computer & electronics repair', ['Computer repair','Data recovery','Electronics repair','Electronics repair shop','Phone repair'], ['Repair'], ['monitor','mobile','wrench','shield-check']),
  group('software', 'Software, AI & SaaS', ['AI Native App','Barber software','Beauty business software','Commerce platform','Retail technology','SaaS','SaaS & billing','Software','Software & creator platforms'], ['Software'], ['code','database','server','lock','credit-card']),
  group('creative', 'Creative studios & agencies', ['Branding studio','Creative agency','Creative services','Creative studio','Design agency','Design studio','Digital agency','Digital studio','Motion design & creative agency','Personal portfolios','Product design','Video production','Web design','Web development agency'], ['Creative'], ['palette','camera','image','edit','film']),
  group('food', 'Restaurants, cafés & catering', ['Food & beverage','Restaurants','Catering','Bakery','Café'], ['Food services','Hospitality'], ['utensils','coffee','wine']),
  group('retail', 'Retail & ecommerce', ['Ecommerce','Retail','Fashion','Jewelry'], ['Retail','Commerce'], ['cart','store','bag','tag']),
  group('professional', 'Consulting & professional services', ['Consulting','Professional services','Accounting'], ['Business','Finance'], ['briefcase','chart-line','handshake']),
  group('finance', 'Finance & insurance', ['Finance','Banking','Insurance','Mortgage'], ['Finance'], ['coins','credit-card','shield-check']),
  group('education', 'Education & training', ['Education','Schools','Training','Community organizations'], ['Education'], ['users','award','globe']),
  group('pets', 'Veterinary & pet services', ['Pets','Veterinary','Pet grooming','Animal care'], ['Pets'], ['heart','medical-cross']),
  group('events', 'Weddings, events & venues', ['Events','Weddings','Venues','Entertainment'], ['Events'], ['ticket','music','camera','calendar']),
  group('automotive', 'Automotive services', ['Automotive','Mechanics','Auto repair'], ['Automotive'], ['car','wrench','shield-check']),
  group('agriculture', 'Agriculture & rural businesses', ['Agriculture','Farms','Nurseries'], ['Agriculture'], ['leaf','tree','sun','droplet']),
  group('sports', 'Sports, fitness & recreation', ['Sports','Fitness','Personal training','Recreation'], ['Sports'], ['dumbbell','pulse','mountain']),
  group('security', 'Security & fire protection', ['Security','Fire protection','Monitoring'], ['Security'], ['lock','shield','eye']),
  group('logistics', 'Moving, logistics & storage', ['Logistics','Moving','Storage','Delivery','Freight'], ['Logistics'], ['truck','package','route']),
  group('travel', 'Travel & hospitality', ['Travel','Hotels','Hospitality','Accommodation'], ['Travel'], ['bed','cloche','suitcase','map-pin']),
]);

export const iconsForIndustry = (industry: IconIndustry) => icons.filter(icon => industry.categories.includes(icon.category) || industry.extras.includes(icon.name));
export const industriesForIcon = (name: string) => iconIndustries.filter(industry => iconsForIndustry(industry).some(icon => icon.name === name));
const normalized = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
export const findIconIndustry = (name: string) => iconIndustries.find(industry => [industry.label, ...industry.terms].some(term => normalized(term) === normalized(name)));

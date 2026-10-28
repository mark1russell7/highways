import type { Edge, Graph, Node, Port } from "@mark1russell7/highways";
import type { CardText } from "./view.ts";

/** The text on a card of a board. A strong card is a hub of the board. */
export type Card = CardText;

/** An example board: cards with made-up data, and the references between them. */
export interface Board {
  readonly id: string;
  /** The name on the button of the board. */
  readonly name: string;
  /** The name of the cards in a group label, for example "cards" or "services". */
  readonly noun: string;
  /** The name of the edges in the facts of the board. */
  readonly edgeNoun: string;
  readonly graph: Graph;
  readonly cards: ReadonlyMap<string, Card>;
  /** The card that the map shows first on a small screen. */
  readonly focus: string;
}

/** The free space between two cards, in units of the plane. The routes go in this space. */
export const GAP = 48;

/** This function gives a pseudo-random generator with a seed (mulberry32). The same seed gives the same numbers. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A board while it grows: the functions add cards and edges in order. */
class Builder {
  readonly nodes: Node[] = [];
  readonly edges: Edge[] = [];
  readonly cards = new Map<string, Card>();
  readonly #pairs = new Set<string>();
  readonly #kinds = new Map<string, string>();

  /**
   * This method adds a card. The string `group` goes in `data.group`, so the grouping rule `keys` puts the cards with one group together.
   * Each edge into the card gets the string `kind` in `data.collection`, so the routers `trunks` and `shared` bundle the edges of one kind.
   */
  card(id: string, x: number, y: number, w: number, h: number, card: Card, group: string, kind: string = group): string {
    this.nodes.push({ id, box: { x, y, w, h }, data: { group } });
    this.#kinds.set(id, kind);
    this.cards.set(id, card);
    return id;
  }

  /** This method adds a row inside the card `parent`. The card is the frame of the row. */
  row(id: string, parent: string, x: number, y: number, w: number, h: number, card: Card): string {
    this.nodes.push({ id, parent, box: { x, y, w, h } });
    this.cards.set(id, card);
    return id;
  }

  /** This method gives the card `id` the plugs `ports` on its walls. */
  plugs(id: string, ports: readonly Port[]): void {
    const i = this.nodes.findIndex((n) => n.id === id);
    this.nodes[i] = { ...this.nodes[i]!, ports };
  }

  /** This method adds an edge with a plug at one end or at both ends. */
  wire(source: string, sourcePort: string | undefined, target: string, targetPort: string | undefined): void {
    const end = (node: string, port: string | undefined): Edge["source"] => (port === undefined ? { node } : { node, port });
    this.edges.push({ id: `e${this.edges.length}`, source: end(source, sourcePort), target: end(target, targetPort) });
  }

  /** This method adds an edge. It gives false and adds nothing for a loop or for a second edge between the same two cards. */
  link(source: string, target: string): boolean {
    const key = source < target ? `${source}|${target}` : `${target}|${source}`;
    if (source === target || this.#pairs.has(key)) return false;
    this.#pairs.add(key);
    const collection = this.#kinds.get(target);
    this.edges.push({ id: `e${this.edges.length}`, source: { node: source }, target: { node: target }, ...(collection === undefined ? {} : { data: { collection } }) });
    return true;
  }

  board(id: string, name: string, noun: string, edgeNoun: string, focus: string): Board {
    return { id, name, noun, edgeNoun, focus, graph: { nodes: this.nodes, edges: this.edges }, cards: this.cards };
  }
}

const pick = <T>(rnd: () => number, list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!;

/**
 * This function makes the delivery board: 4 depots, 24 shops and 48 orders in 4 districts.
 * A depot supplies the shops of its district and some shops of other districts. A shop fills orders.
 * The group of a card is the supply (the depot and the shops) or the orders of its district. The kind of a card is depot, shop or order.
 */
export function deliveryBoard(): Board {
  const rnd = seeded(4817);
  const b = new Builder();
  const depots = ["North depot", "Harbor depot", "Valley depot", "Old Mill depot"];
  const districts = ["North", "Harbor", "Valley", "Old Mill"];
  const shopNames = [
    "Corner Grocer", "Daily Bread", "Green Basket", "Pine St Market", "Blue Door Deli", "Sunrise Foods",
    "Hilltop Pantry", "Canal Kiosk", "Market Hall", "Oak Lane Shop", "The Larder", "Fresh Fields",
    "Little Bazaar", "Station Store", "Maple Mart", "Riverside Stall", "Night Owl", "Garden Gate",
    "Twin Bridges", "Copper Kettle", "Bay Provisions", "Lamp Post Shop", "Meadow Mart", "Cedar Corner",
  ];
  const goods = ["crates", "boxes", "sacks", "trays", "cases"];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const col = 132;
  // A district: the depot on top, two rows of three shops, then three rows of four orders.
  const width = 4 * col + 3 * GAP;
  const height = 52 + GAP + 2 * (44 + GAP) + 3 * (40 + GAP) - GAP;
  const depotIds: string[] = [];
  const shopsOf: string[][] = [];
  const ordersOf: string[][] = [];
  let shopNo = 0;
  let orderNo = 4100;
  for (let d = 0; d < 4; d++) {
    const ox = (d % 2) * (width + 2 * GAP);
    const oy = Math.floor(d / 2) * (height + 2 * GAP);
    depotIds.push(b.card(`depot${d}`, ox + (width - 176) / 2, oy, 176, 52, { title: depots[d]!, sub: "Depot", strong: true }, `${districts[d]!} supply`, "depots"));
    const shops: string[] = [];
    const span = 3 * col + 2 * GAP;
    for (let i = 0; i < 6; i++) {
      const x = ox + (width - span) / 2 + (i % 3) * (col + GAP);
      const y = oy + 52 + GAP + Math.floor(i / 3) * (44 + GAP);
      shops.push(b.card(`shop${shopNo}`, x, y, col, 44, { title: shopNames[shopNo]!, sub: "Shop" }, `${districts[d]!} supply`, "shops"));
      shopNo++;
    }
    shopsOf.push(shops);
    const orders: string[] = [];
    for (let i = 0; i < 12; i++) {
      const x = ox + (i % 4) * (col + GAP) + (col - 116) / 2;
      const y = oy + 52 + GAP + 2 * (44 + GAP) + Math.floor(i / 4) * (40 + GAP);
      orderNo += 1 + Math.floor(rnd() * 40);
      const sub = `${2 + Math.floor(rnd() * 11)} ${pick(rnd, goods)}, ${pick(rnd, days)}`;
      orders.push(b.card(`order${orderNo}`, x, y, 116, 40, { title: `Order ${orderNo}`, sub }, `${districts[d]!} orders`, "orders"));
    }
    ordersOf.push(orders);
  }
  // The districts next to each district: the district beside it and the district over or under it.
  const near = [
    [1, 2],
    [0, 3],
    [0, 3],
    [1, 2],
  ];
  // A depot supplies each shop of its district.
  for (let d = 0; d < 4; d++) for (const s of shopsOf[d]!) b.link(depotIds[d]!, s);
  // Some shops get goods from the depot of a district next to theirs.
  for (let n = 0; n < 8; ) {
    const d = Math.floor(rnd() * 4);
    if (b.link(depotIds[pick(rnd, near[d]!)]!, pick(rnd, shopsOf[d]!))) n++;
  }
  // Each order comes from a shop. Most shops are in the district of the order.
  for (let d = 0; d < 4; d++)
    for (const o of ordersOf[d]!) b.link(pick(rnd, shopsOf[rnd() < 0.85 ? d : pick(rnd, near[d]!)]!), o);
  // Some orders need goods from a second shop, often in another district.
  for (let n = 0; n < 20; ) {
    const d = Math.floor(rnd() * 4);
    if (b.link(pick(rnd, shopsOf[rnd() < 0.5 ? d : pick(rnd, near[d]!)]!), pick(rnd, ordersOf[d]!))) n++;
  }
  // The depots move stock between them.
  for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) b.link(depotIds[p]!, depotIds[q]!);
  // A large order goes from the depot directly.
  for (let n = 0; n < 14; ) {
    const d = Math.floor(rnd() * 4);
    if (b.link(depotIds[d]!, pick(rnd, ordersOf[d]!))) n++;
  }
  return b.board("delivery", "Delivery network", "cards", "deliveries", "shop1");
}

/** The rows of the service map, from the clients down to the stores of data. */
const SERVICE_ROWS: readonly (readonly [string, string][])[] = [
  [
    ["web", "Web app"],
    ["mobile", "Mobile app"],
    ["partner", "Partner API"],
    ["admin", "Admin console"],
  ],
  [
    ["gateway", "Gateway"],
    ["auth", "Sign-in"],
    ["limits", "Rate limits"],
    ["flags", "Feature flags"],
  ],
  [
    ["catalog", "Catalog"],
    ["search", "Search"],
    ["cart", "Cart"],
    ["checkout", "Checkout"],
    ["orders", "Orders"],
    ["accounts", "Accounts"],
    ["reviews", "Reviews"],
    ["recommend", "Picks for you"],
  ],
  [
    ["pricing", "Pricing"],
    ["stock", "Stock"],
    ["payments", "Payments"],
    ["shipping", "Shipping"],
    ["notify", "Notices"],
    ["billing", "Billing"],
    ["media", "Images"],
    ["profile", "Profiles"],
  ],
  [
    ["ordersdb", "Orders store"],
    ["usersdb", "Users store"],
    ["catalogdb", "Catalog store"],
    ["index", "Search index"],
    ["cache", "Cache"],
    ["bus", "Event bus"],
    ["files", "File store"],
  ],
];

const SERVICE_LAYER = ["Client", "Edge", "App service", "Core service", "Data"];

/** The calls of the service map: each pair is a service and a service that it uses. */
const SERVICE_CALLS = `
web gateway, mobile gateway, partner gateway, admin gateway, web files, mobile files,
gateway auth, gateway limits, gateway flags, gateway catalog, gateway search, gateway cart, gateway checkout,
gateway orders, gateway accounts, gateway reviews, gateway recommend, admin auth, admin flags, partner auth,
auth usersdb, auth cache, limits cache, flags cache,
catalog pricing, catalog stock, catalog media, catalog catalogdb, catalog cache,
search index, search catalog, search pricing,
cart pricing, cart stock, cart cache, cart catalog,
checkout cart, checkout payments, checkout shipping, checkout pricing, checkout stock, checkout orders, checkout notify,
orders ordersdb, orders bus, orders shipping, orders billing, orders notify,
accounts profile, accounts usersdb, accounts billing, accounts notify,
reviews profile, reviews catalogdb, reviews media, reviews bus,
recommend catalog, recommend index, recommend ordersdb, recommend profile, recommend cache,
pricing catalogdb, pricing cache, stock catalogdb, stock bus,
payments billing, payments bus, payments ordersdb, shipping bus, shipping ordersdb,
notify bus, notify usersdb, billing ordersdb, billing usersdb, media files, profile usersdb, profile files
`;

/** This function makes the service map: 31 services in five layers, and the calls between them. The group and the kind of a service are its layer. */
export function servicesBoard(): Board {
  const b = new Builder();
  const w = 140;
  const h = 46;
  const widest = Math.max(...SERVICE_ROWS.map((r) => r.length));
  const full = widest * w + (widest - 1) * GAP;
  SERVICE_ROWS.forEach((row, r) => {
    const span = row.length * w + (row.length - 1) * GAP;
    row.forEach(([id, title], i) => {
      const x = (full - span) / 2 + i * (w + GAP);
      const y = r * (h + 2 * GAP);
      b.card(id, x, y, w, h, { title, sub: SERVICE_LAYER[r]!, strong: id === "gateway" || id === "bus" }, SERVICE_LAYER[r]!);
    });
  });
  for (const pair of SERVICE_CALLS.split(",")) {
    const [from, to] = pair.trim().split(/\s+/);
    if (from && to) b.link(from, to);
  }
  return b.board("services", "Service map", "services", "calls", "gateway");
}

/** The courses of the plan: an id, a title, the year, the column, and the ids of the courses that come first. */
const COURSES: readonly [string, string, number, number, string][] = [
  ["MA101", "Calculus I", 1, 0, ""],
  ["CS101", "Programming I", 1, 1, ""],
  ["CS102", "Programming II", 1, 2, "CS101"],
  ["EN101", "Technical writing", 1, 3, ""],
  ["PH101", "Physics I", 1, 4, "MA101"],
  ["DS101", "Data literacy", 1, 5, ""],
  ["MA201", "Calculus II", 2, 0, "MA101"],
  ["MA202", "Linear algebra", 2, 1, "MA101"],
  ["CS201", "Data structures", 2, 2, "CS102 MA101"],
  ["CS202", "Computer systems", 2, 3, "CS102"],
  ["PH201", "Physics II", 2, 4, "PH101 MA201"],
  ["DS201", "Statistics", 2, 5, "MA101 DS101"],
  ["MA301", "Discrete math", 3, 0, "MA202 CS101"],
  ["CS301", "Algorithms", 3, 1, "CS201 MA301"],
  ["CS302", "Operating systems", 3, 2, "CS202 CS201"],
  ["CS303", "Networks", 3, 3, "CS202 PH201"],
  ["CS304", "Databases", 3, 4, "CS201 DS201"],
  ["DS301", "Machine learning", 3, 5, "DS201 MA202 CS201"],
  ["CS305", "Human factors", 3, 6, "EN101 DS101"],
  ["CS401", "Compilers", 4, 0, "CS301 CS302"],
  ["CS402", "Distributed systems", 4, 1, "CS302 CS303 CS304"],
  ["CS403", "Security", 4, 2, "CS303 CS302 MA301"],
  ["CS404", "Graphics", 4, 3, "MA202 CS301 PH201"],
  ["DS401", "Data at scale", 4, 4, "CS304 DS301 CS402"],
  ["CS405", "Product studio", 4, 5, "CS305 CS304 EN101"],
  ["CS499", "Capstone", 5, 2, "CS301 CS402 CS405 EN101"],
  ["DS499", "Research project", 5, 4, "DS301 DS401 EN101 DS201"],
];

/** This function makes the course plan: 27 courses in five rows, and the courses that each course needs first. The group and the kind of a course are its year. */
export function coursesBoard(): Board {
  const b = new Builder();
  const w = 150;
  const h = 48;
  const credits = seeded(27);
  for (const [id, title, year, column] of COURSES) {
    const x = column * (w + GAP) + (year === 5 ? (w + GAP) / 2 : 0);
    const y = (year - 1) * (h + 2 * GAP);
    const label = year === 5 ? "Final term" : `Year ${year}`;
    b.card(id, x, y, w, h, { title, sub: `${id}, ${label}, ${3 + Math.floor(credits() * 3)} credits`, strong: year === 5 }, label);
  }
  for (const [id, , , , needs] of COURSES) for (const first of needs.split(" ").filter(Boolean)) b.link(first, id);
  return b.board("courses", "Course plan", "courses", "prerequisites", "CS302");
}

/** The example boards, in the order of the page. */
export const BOARDS: readonly (() => Board)[] = [deliveryBoard, servicesBoard, coursesBoard];

/** The rows of the table card of the board `orders`: an id and a title. */
const ORDER_ROWS: readonly [string, string][] = [
  ["id", "order id"],
  ["customer", "customer id"],
  ["product", "product id"],
  ["quantity", "quantity"],
  ["total", "invoice id"],
  ["status", "shipment id"],
];

/**
 * This function makes the board `orders`: one table card with 6 rows and 4 plugs on its walls, and 4 other tables.
 * Each outer edge goes from a table to a plug of the wall. Each inner edge goes from a row to a plug, inside the card (INTERIOR-ROUTE).
 */
export function ordersBoard(): Board {
  const b = new Builder();
  const card = { x: 260, y: 0, w: 240, h: 236 };
  b.card("orders", card.x, card.y, card.w, card.h, { title: "Orders", strong: true }, "orders");
  ORDER_ROWS.forEach(([id, title], i) => b.row(`orders.${id}`, "orders", card.x + 20, card.y + 40 + i * 30, card.w - 40, 24, { title }));
  b.plugs("orders", [
    { id: "w1", side: "west", along: 0.25 },
    { id: "w2", side: "west", along: 0.75 },
    { id: "e1", side: "east", along: 0.25 },
    { id: "e2", side: "east", along: 0.75 },
  ]);
  const tables: [string, string, number, number][] = [
    ["customers", "Customers", 0, 30],
    ["invoices", "Invoices", 0, 150],
    ["products", "Products", 590, 30],
    ["shipments", "Shipments", 590, 150],
  ];
  for (const [id, title, x, y] of tables) b.card(id, x, y, 170, 56, { title, sub: "table" }, "tables");
  b.wire("customers", undefined, "orders", "w1");
  b.wire("invoices", undefined, "orders", "w2");
  b.wire("orders", "e1", "products", undefined);
  b.wire("orders", "e2", "shipments", undefined);
  b.wire("orders.customer", undefined, "orders", "w1");
  b.wire("orders.total", undefined, "orders", "w2");
  b.wire("orders", "e1", "orders.product", undefined);
  b.wire("orders", "e2", "orders.status", undefined);
  return b.board("orders", "Table rows", "tables", "references", "orders");
}

/** The boards of the examples page: the boards of `BOARDS`, then the board with a frame. The compare page shows only `BOARDS`. */
export const EXAMPLE_BOARDS: readonly (() => Board)[] = [...BOARDS, ordersBoard];

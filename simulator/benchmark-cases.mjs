// Frozen synthetic fixtures for software checks. Held-out means excluded from scorer tuning in this milestone,
// not independently collected or statistically representative data. IDs/acceptable answers stay evaluator-only.
const record=(id,title,description)=>({id,title,description,category:'Resources',tags:[],aliases:[]});
const cases=[
 {id:'dev-generic',split:'development',type:'alias',prompt:'Find the city with five boroughs in the directory.',query:'directory',acceptableIds:[],records:[record('college','College Directory','Directory entry for campus programs.')]},
 {id:'dev-positive',split:'development',type:'literal',prompt:'Find bicycle parking locations.',query:'bicycle',acceptableIds:['bike'],records:[record('bike','Bicycle Parking','Find secure bicycle parking locations.'),record('cars','Car Parking','Find parking permits for vehicles.')]},
 {id:'dev-absent',split:'development',type:'absent',prompt:'Find observatory telescope reservations.',query:'observatory',acceptableIds:[],records:[record('cafe','Campus Cafe','Coffee and meals for visitors.')]},
 {id:'dev-misleading',split:'development',type:'misleading',prompt:'Find library journal articles.',query:'library',acceptableIds:['journals'],records:[record('hours','Library Hours','Opening times and study spaces.'),record('journals','Library Journal Articles','Search journal articles and publications.')]},
 {id:'heldout-spelling',split:'held-out',type:'spelling',prompt:'Find swimming pool opening hours.',query:'swiming pool',acceptableIds:['pool'],records:[record('pool','Swimming Pool','Opening hours and lane reservations.'),record('classes','Swimming Classes','Register for swimming instruction.')]},
 {id:'heldout-alias',split:'held-out',type:'alias',prompt:'Find the international student advising office.',query:'ISA',acceptableIds:['advice'],records:[{...record('advice','International Student Advising','Office for international student advising.'),aliases:[{term:'ISA',type:'alias'}]},record('study','Student Study Spaces','Rooms and opening hours.')]},
 {id:'heldout-reordered',split:'held-out',type:'reordered',prompt:'Find the bus timetable for evening routes.',query:'timetable bus',acceptableIds:['bus'],records:[record('bus','Bus Timetable','Evening routes and departure times.'),record('rail','Rail Timetable','Intercity train departures.')]},
 {id:'heldout-absent',split:'held-out',type:'absent',prompt:'Find volcanic eruption evacuation procedures.',query:'evacuation',acceptableIds:[],records:[record('library','Library Directory','Directory entry for research services.')]},
 {id:'heldout-ambiguous',split:'held-out',type:'ambiguous',prompt:'Find a campus cafe serving coffee.',query:'coffee',acceptableIds:['north','south'],records:[record('north','North Campus Cafe','Coffee and food on campus.'),record('south','South Campus Cafe','Coffee and meals on campus.')]},
 {id:'heldout-distractor',split:'held-out',type:'misleading',prompt:'Find emergency plumbing repairs.',query:'repairs',acceptableIds:['plumber'],records:[record('computer','Computer Repairs','Laptop and desktop repairs.'),record('plumber','Emergency Plumbing Repairs','Emergency plumbing repairs and water leaks.')]}
];
export const BENCHMARK_VERSION='synthetic-sanity-cases-v1';
export const benchmarkCases=()=>structuredClone(cases);

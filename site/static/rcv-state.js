// What's selected on the page, and the two things any drawing module may ask for. rcv.js fills those in.
export const state = { contest: null, hd: "all", keepCounting: false, path: [], mapMode: "first" };
export const actions = { render() {}, selectDistrict() {}, selectContest() {} };
export const currentContest = { value: null };

declare module "phil-reg-prov-mun-brgy" {
  interface Province {
    name: string;
    prov_code: string;
  }

  interface Municipality {
    name: string;
    mun_code: string;
  }

  interface Barangay {
    name: string;
  }

  const phil: {
    provinces: Province[];
    getCityMunByProvince(provinceCode: string): Municipality[];
    getBarangayByMun(municipalityCode: string): Barangay[];
  };

  export default phil;
}

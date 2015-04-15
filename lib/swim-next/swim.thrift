enum State {
    Alive = 1,
    Suspect = 2,
    Faulty = 3
}

struct Update {
    1: required string meta;
    2: required string address;
    3: required State state;
    4: required int incarnationNumber;
}

struct Ack {
    1: required list<Update> updates;
    2: required string checksum;
}

service Swim {
    Ack sync(1:list<Update> updates, 2:string checksum);
    Ack ping(1:list<Update> updates, 2:string checksum);
    Ack pingReq(1:list<Update> updates, 2:string checksum, 3:string target);
}

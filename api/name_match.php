<?php
// name_match.php — fuzzy name scoring for the "claim your profile" picker.
// Ranks unlinked roster golfers by how closely they match the name the joining
// user gave, so the likely person floats to the top. Handles common nicknames
// (Mike/Michael), typos (Levenshtein), and phonetic near-misses (metaphone).

function _nm_norm($s) {
    return strtolower(trim(preg_replace('/[^\p{L}\s\-]/u', '', $s)));
}

// Returns true if two first names are known nickname variants of each other.
function _nm_nickname_equiv($a, $b) {
    static $lookup = null;
    if ($lookup === null) {
        $groups = [
            ['mike','michael','mikey'], ['rob','robert','bob','bobby','robbie'],
            ['bill','william','will','billy','willie'], ['jim','james','jimmy','jamie'],
            ['joe','joseph','joey'], ['chris','christopher','christophe'],
            ['dave','david','davey'], ['dan','daniel','danny'],
            ['tom','thomas','tommy'], ['rick','richard','rich','richie','dick'],
            ['tony','anthony'], ['matt','matthew','matty'],
            ['nick','nicholas','nicky'], ['andy','andrew','drew'],
            ['ben','benjamin','benji','benny'], ['sam','samuel','sammy'],
            ['alex','alexander','al'], ['ed','edward','eddie','ted','teddy'],
            ['steve','stephen','steven','stevie'], ['greg','gregory'],
            ['jeff','jeffrey','geoff'], ['ken','kenneth','kenny'],
            ['ron','ronald','ronnie'], ['don','donald','donnie'],
            ['charlie','charles','chuck','charly'], ['pat','patrick','paddy'],
            ['ray','raymond'], ['gene','eugene'], ['frank','francis','franklin'],
            ['hank','henry','harry'], ['jack','john','johnny','jon'],
            ['larry','lawrence'], ['pete','peter'], ['phil','phillip','philip'],
            ['tim','timothy'], ['vince','vincent'], ['walt','walter'],
            ['nate','nathan','nathaniel'], ['gabe','gabriel'],
            ['zach','zachary','zack'], ['josh','joshua'], ['mitch','mitchell'],
            ['kate','katherine','katie','kathy','catherine'],
            ['liz','elizabeth','beth','betty'], ['peggy','margaret','maggie','meg'],
            ['sue','susan','suzie'], ['jen','jennifer','jenny'],
            ['deb','deborah','debbie'], ['cathy','catherine','cat'],
        ];
        $lookup = [];
        foreach ($groups as $g) {
            foreach ($g as $n) $lookup[$n] = $g;
        }
    }
    if ($a === '' || $b === '') return false;
    if ($a === $b) return true;
    return isset($lookup[$a]) && in_array($b, $lookup[$a], true);
}

// Score how well a candidate name matches the target name (higher = closer).
function nm_score($tFirst, $tLast, $cFirst, $cLast) {
    $tFirst = _nm_norm($tFirst); $tLast = _nm_norm($tLast);
    $cFirst = _nm_norm($cFirst); $cLast = _nm_norm($cLast);
    $score = 0;

    // Last name
    if ($tLast !== '' && $cLast !== '') {
        if ($tLast === $cLast) {
            $score += 50;
        } else {
            $d = levenshtein($tLast, $cLast);
            if ($d === 1) $score += 34;
            elseif ($d === 2 && max(strlen($tLast), strlen($cLast)) >= 5) $score += 22;
            elseif (metaphone($tLast) !== '' && metaphone($tLast) === metaphone($cLast)) $score += 26;
        }
    }

    // First name
    if ($tFirst !== '' && $cFirst !== '') {
        if ($tFirst === $cFirst) {
            $score += 40;
        } elseif (_nm_nickname_equiv($tFirst, $cFirst)) {
            $score += 36;
        } elseif ((strlen($tFirst) === 1 && $tFirst[0] === $cFirst[0]) ||
                  (strlen($cFirst) === 1 && $cFirst[0] === $tFirst[0])) {
            $score += 14; // one side is just an initial
        } else {
            $d = levenshtein($tFirst, $cFirst);
            if ($d === 1) $score += 22;
            elseif ($d === 2 && max(strlen($tFirst), strlen($cFirst)) >= 5) $score += 12;
            elseif (metaphone($tFirst) !== '' && metaphone($tFirst) === metaphone($cFirst)) $score += 16;
        }
    }

    return $score;
}

// Sort candidates by match score (best first) and flag the likely ones.
// $candidates: array of assoc rows with first_name/last_name.
function nm_rank_candidates(array $candidates, $tFirst, $tLast, $threshold = 34) {
    foreach ($candidates as &$c) {
        $c['score']  = nm_score($tFirst, $tLast, $c['first_name'], $c['last_name']);
        $c['likely'] = $c['score'] >= $threshold;
    }
    unset($c);
    usort($candidates, function ($a, $b) {
        if ($b['score'] !== $a['score']) return $b['score'] - $a['score'];
        return strcmp($a['last_name'] . $a['first_name'], $b['last_name'] . $b['first_name']);
    });
    return $candidates;
}

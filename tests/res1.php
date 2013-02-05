<?php
    Header('Cache-Control: no-cache');
    Header('Pragma: no-cache');

    $t=$_GET['t'];
    sleep($t);
?>
{ "test_1" : 1 }